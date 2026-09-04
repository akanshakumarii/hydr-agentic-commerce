import { pool } from '../db/pool.js';
import { audit } from './audit.js';

const HIGH_QTY_THRESHOLD = 15;          // single line item quantity that looks abnormal for skincare
const VELOCITY_WINDOW_MINUTES = 10;
const VELOCITY_ORDER_THRESHOLD = 3;     // same session/user creating this many orders in the window

/**
 * Runs after order creation. Never blocks checkout (orders still complete),
 * but rows suspicious orders into fraud_flags for the admin review queue
 * instead of letting them pass silently. Called for every order regardless
 * of order_source.
 */
export async function checkFraud({ order, items, userId, sessionKey }) {
  const reasons = [];
  let score = 0;

  const maxQty = Math.max(...items.map((i) => i.quantity));
  if (maxQty >= HIGH_QTY_THRESHOLD) {
    reasons.push(`Abnormally high quantity on a single item (${maxQty} units)`);
    score += 40;
  }

  // Scripted-looking price/quantity: exact round numbers across every line at high volume.
  const scriptedLooking = items.every((i) => i.quantity % 5 === 0) && items.length > 1 && maxQty >= 10;
  if (scriptedLooking) {
    reasons.push('Price/quantity pattern across items looks scripted');
    score += 20;
  }

  // Velocity: same user (or session key, for guests) creating many orders quickly.
  const velocityParams = userId ? [userId] : [sessionKey || 'unknown'];
  const velocityWhere = userId ? `user_id = $1` : `guest_email = $1`;
  const { rows: recent } = await pool.query(
    `SELECT count(*)::int AS c FROM orders
     WHERE ${velocityWhere} AND created_at > now() - interval '${VELOCITY_WINDOW_MINUTES} minutes'`,
    velocityParams
  );
  if ((recent[0]?.c || 0) >= VELOCITY_ORDER_THRESHOLD) {
    reasons.push(`${recent[0].c} orders from the same ${userId ? 'account' : 'guest email'} within ${VELOCITY_WINDOW_MINUTES} minutes`);
    score += 35;
  }

  if (order.order_source === 'external_agent') {
    // External callers are inherently less trusted — small baseline bump.
    score += 5;
  }

  if (reasons.length) {
    await pool.query(
      `INSERT INTO fraud_flags (order_id, reason, score) VALUES ($1,$2,$3)`,
      [order.id, reasons.join('; '), Math.min(score, 100)]
    );
    await audit({
      actorType: 'system',
      action: 'fraud.flag',
      entityType: 'order',
      entityId: order.id,
      metadata: { reasons, score },
    });
  }

  return { flagged: reasons.length > 0, reasons, score };
}

/** Return/chargeback-aware behavior: don't let an automated flow auto-approve
 * a return for a customer whose return rate is already high. */
export async function evaluateReturnRequest({ orderId, userId, reason }) {
  let autoApprove = true;
  let note = 'Standard return — auto-approved.';

  if (userId) {
    const { rows } = await pool.query(
      `SELECT
         count(*) FILTER (WHERE status IN ('returned','return_requested'))::float / GREATEST(count(*),1) AS return_rate,
         count(*)::int AS total_orders
       FROM orders WHERE user_id = $1`,
      [userId]
    );
    const returnRate = Number(rows[0]?.return_rate || 0);
    const totalOrders = Number(rows[0]?.total_orders || 0);
    if (totalOrders >= 3 && returnRate > 0.4) {
      autoApprove = false;
      note = `Customer return rate is ${(returnRate * 100).toFixed(0)}% across ${totalOrders} orders — routed to admin review instead of auto-approving.`;
    }
  }

  const { rows: retRows } = await pool.query(
    `INSERT INTO returns (order_id, user_id, reason, status) VALUES ($1,$2,$3,$4) RETURNING *`,
    [orderId, userId || null, reason || null, autoApprove ? 'auto_approved' : 'needs_review']
  );

  await audit({
    actorType: 'system',
    actorId: userId,
    action: autoApprove ? 'return.auto_approved' : 'return.flagged_for_review',
    entityType: 'order',
    entityId: orderId,
    metadata: { note },
  });

  return { return: retRows[0], autoApprove, note };
}
