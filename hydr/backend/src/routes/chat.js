import { Router } from 'express';
import { z } from 'zod';
import { wrap, AppError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, chatRateLimit } from '../middleware/limits.js';
import { pool } from '../db/pool.js';
import { runAgentTurn } from '../services/agent.js';
import { logger } from '../services/logger.js';

const router = Router();
router.use(requireAuth); // chat history must be tied to user_id, not sessionStorage — login required

router.get('/sessions', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, title, created_at FROM chat_sessions WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ sessions: rows });
}));

router.post('/sessions', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO chat_sessions (user_id, title) VALUES ($1,$2) RETURNING id, title, created_at`,
    [req.user.id, req.body?.title || 'New conversation']
  );
  res.status(201).json({ session: rows[0] });
}));

router.get('/sessions/:id/messages', wrap(async (req, res) => {
  await assertOwnsSession(req.params.id, req.user.id);
  const { rows } = await pool.query(
    `SELECT id, role, content, tool_calls, widgets, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  res.json({ messages: rows });
}));

router.post(
  '/sessions/:id/messages',
  chatRateLimit,
  validateBody(z.object({ message: z.string().min(1).max(2000) })),
  wrap(async (req, res) => {
    await assertOwnsSession(req.params.id, req.user.id);
    const sessionId = req.params.id;

    await pool.query(`INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'user',$2)`, [sessionId, req.body.message]);

    const historyRows = await pool.query(
      `SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 20`,
      [sessionId]
    );
    // Drop the message we just inserted from history (it's passed separately as userMessage).
    const history = historyRows.rows.slice(0, -1).filter((m) => m.role === 'user' || m.role === 'assistant');

    let agentResult;
    try {
      agentResult = await runAgentTurn({
        history,
        userMessage: req.body.message,
        userId: req.user.id,
        orderSource: 'in_app_agent',
        sessionKey: req.ip,
      });
    } catch (err) {
      // The agent must never be a single point of failure — surface a friendly
      // fallback and let the user keep browsing/checking out manually.
      logger.warn('agent_turn_failed', { sessionId, code: err.code, message: err.message });
      const fallback = err instanceof AppError ? err.message : 'HYDR-U is having trouble right now. Please try again in a moment.';
      await pool.query(`INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'assistant',$2)`, [sessionId, fallback]);
      return res.status(err.status && err.status < 500 ? err.status : 200).json({ reply: fallback, actions: [], widgets: [], degraded: true });
    }

    await pool.query(
      `INSERT INTO chat_messages (session_id, role, content, tool_calls, widgets) VALUES ($1,'assistant',$2,$3,$4)`,
      [sessionId, agentResult.reply, JSON.stringify(agentResult.actions), JSON.stringify(agentResult.widgets || [])]
    );

    res.json(agentResult);
  })
);

/** Proactive nudge: surfaces an active coupon or low-stock alert relevant to what the user is browsing.
 * Called by the frontend product page — never inserted mid-agent-response as invented text. */
router.get('/proactive', wrap(async (req, res) => {
  const productId = req.query.product_id;
  const messages = [];

  const coupon = await pool.query(`SELECT code, percent_off FROM coupons WHERE active = true AND expires_at > now() ORDER BY percent_off DESC LIMIT 1`);
  if (coupon.rows.length) {
    messages.push(`Psst — code ${coupon.rows[0].code} takes ${coupon.rows[0].percent_off}% off right now.`);
  }
  if (productId) {
    const stock = await pool.query(`SELECT stock, name FROM products WHERE id = $1`, [productId]);
    if (stock.rows.length && stock.rows[0].stock > 0 && stock.rows[0].stock <= 5) {
      messages.push(`Only ${stock.rows[0].stock} left of ${stock.rows[0].name} — grab it before it's gone.`);
    }
  }
  res.json({ messages });
}));

async function assertOwnsSession(sessionId, userId) {
  const { rows } = await pool.query(`SELECT user_id FROM chat_sessions WHERE id = $1`, [sessionId]);
  if (!rows.length) throw new AppError(404, 'session_not_found', 'That conversation could not be found.');
  if (rows[0].user_id !== userId) throw new AppError(403, 'forbidden', 'You do not have access to this conversation.');
}

export default router;
