import { pool } from '../db/pool.js';
import { AppError } from './errors.js';

/**
 * agent-to-agent endpoints require a valid API key tied to a
 * row in external_agent_clients. This is the gate that stops anyone
 * unauthenticated from creating checkouts against the store.
 */
export async function requireExternalAgent(req, _res, next) {
  const key = req.headers['x-api-key'];
  if (!key || typeof key !== 'string') {
    return next(new AppError(401, 'missing_api_key', 'x-api-key header is required for this endpoint.'));
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, name, status FROM external_agent_clients WHERE api_key = $1`,
      [key]
    );
    if (!rows.length) return next(new AppError(401, 'invalid_api_key', 'Unknown API key.'));
    if (rows[0].status !== 'active') {
      return next(new AppError(403, 'client_suspended', 'This external agent client is suspended.'));
    }
    req.externalAgent = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}
