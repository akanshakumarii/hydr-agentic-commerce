import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { wrap, AppError } from '../middleware/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/limits.js';
import { pool } from '../db/pool.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// ---- Dashboard: revenue/orders overall + split by order_source ----
router.get('/dashboard', wrap(async (_req, res) => {
  const totals = await pool.query(
    `SELECT count(*)::int AS order_count, COALESCE(sum(total_paise),0)::bigint AS revenue_paise
     FROM orders WHERE status != 'cancelled'`
  );
  const bySource = await pool.query(
    `SELECT order_source, count(*)::int AS order_count, COALESCE(sum(total_paise),0)::bigint AS revenue_paise
     FROM orders WHERE status != 'cancelled' GROUP BY order_source ORDER BY revenue_paise DESC`
  );
  const fraudPending = await pool.query(`SELECT count(*)::int AS c FROM fraud_flags WHERE reviewed = false`);
  const returnsPending = await pool.query(`SELECT count(*)::int AS c FROM returns WHERE status = 'needs_review'`);

  res.json({
    totals: totals.rows[0],
    by_source: bySource.rows,
    pending_fraud_review: fraudPending.rows[0].c,
    pending_return_review: returnsPending.rows[0].c,
  });
}));

// ---- Orders list with filters ----
router.get('/orders', wrap(async (req, res) => {
  const { source, status, limit = 50 } = req.query;
  const clauses = [];
  const params = [];
  if (source) { params.push(source); clauses.push(`order_source = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Number(limit));
  const { rows } = await pool.query(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  res.json({ orders: rows });
}));

// ---- Full audit trail for one order ----
router.get('/orders/:id/audit', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM audit_log WHERE entity_type = 'order' AND entity_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  const history = await pool.query(`SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`, [req.params.id]);
  res.json({ audit: rows, status_history: history.rows });
}));

// ---- Fraud review queue ----
router.get('/fraud-queue', wrap(async (req, res) => {
  const onlyPending = req.query.all !== 'true';
  const { rows } = await pool.query(
    `SELECT ff.*, o.total_paise, o.order_source, o.status AS order_status, o.guest_email, o.user_id
     FROM fraud_flags ff JOIN orders o ON o.id = ff.order_id
     ${onlyPending ? 'WHERE ff.reviewed = false' : ''}
     ORDER BY ff.created_at DESC`
  );
  res.json({ flags: rows });
}));

router.post(
  '/fraud-queue/:id/review',
  validateBody(z.object({ decision: z.enum(['approve', 'reject']) })),
  wrap(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE fraud_flags SET reviewed = true, reviewer_decision = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, req.body.decision]
    );
    if (!rows.length) throw new AppError(404, 'not_found', 'Flag not found.');
    if (req.body.decision === 'reject') {
      await pool.query(`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1`, [rows[0].order_id]);
    }
    await audit({ actorType: 'admin', actorId: req.user.id, action: 'fraud.review', entityType: 'order', entityId: rows[0].order_id, metadata: { decision: req.body.decision } });
    res.json({ flag: rows[0] });
  })
);

// ---- Returns review queue ----
router.get('/returns-queue', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, o.total_paise, o.order_source FROM returns r JOIN orders o ON o.id = r.order_id
     WHERE r.status = 'needs_review' ORDER BY r.created_at DESC`
  );
  res.json({ returns: rows });
}));

router.post(
  '/returns-queue/:id/review',
  validateBody(z.object({ decision: z.enum(['approve', 'reject']) })),
  wrap(async (req, res) => {
    const status = req.body.decision === 'approve' ? 'approved' : 'rejected';
    const { rows } = await pool.query(`UPDATE returns SET status = $2 WHERE id = $1 RETURNING *`, [req.params.id, status]);
    if (!rows.length) throw new AppError(404, 'not_found', 'Return request not found.');
    if (status === 'approved') {
      await pool.query(`UPDATE orders SET status = 'returned', updated_at = now() WHERE id = $1`, [rows[0].order_id]);
    }
    await audit({ actorType: 'admin', actorId: req.user.id, action: 'return.review', entityType: 'order', entityId: rows[0].order_id, metadata: { decision: req.body.decision } });
    res.json({ return: rows[0] });
  })
);

// ---- External agent clients ----
router.get('/external-agents', wrap(async (_req, res) => {
  const clients = await pool.query(`SELECT id, name, status, created_at FROM external_agent_clients ORDER BY created_at DESC`);
  const volume = await pool.query(
    `SELECT external_agent_client_id, count(*)::int AS order_count, COALESCE(sum(total_paise),0)::bigint AS revenue_paise
     FROM orders WHERE order_source = 'external_agent' GROUP BY external_agent_client_id`
  );
  const volMap = Object.fromEntries(volume.rows.map((v) => [v.external_agent_client_id, v]));
  res.json({
    clients: clients.rows.map((c) => ({ ...c, order_count: volMap[c.id]?.order_count || 0, revenue_paise: volMap[c.id]?.revenue_paise || 0 })),
  });
}));

router.post('/external-agents', validateBody(z.object({ name: z.string().min(1).max(120) })), wrap(async (req, res) => {
  const apiKey = `hydr_ext_${crypto.randomBytes(24).toString('hex')}`;
  const { rows } = await pool.query(
    `INSERT INTO external_agent_clients (name, api_key) VALUES ($1,$2) RETURNING id, name, api_key, status, created_at`,
    [req.body.name, apiKey]
  );
  await audit({ actorType: 'admin', actorId: req.user.id, action: 'external_agent.create', entityType: 'external_agent_client', entityId: rows[0].id });
  res.status(201).json({ client: rows[0] }); // api_key shown once at creation
}));

router.post('/external-agents/:id/suspend', wrap(async (req, res) => {
  const { rows } = await pool.query(`UPDATE external_agent_clients SET status = 'suspended' WHERE id = $1 RETURNING id, name, status`, [req.params.id]);
  if (!rows.length) throw new AppError(404, 'not_found', 'Client not found.');
  await audit({ actorType: 'admin', actorId: req.user.id, action: 'external_agent.suspend', entityType: 'external_agent_client', entityId: req.params.id });
  res.json({ client: rows[0] });
}));

export default router;
