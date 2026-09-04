import { pool } from '../db/pool.js';

export async function audit({ actorType, actorId = null, action, entityType = null, entityId = null, metadata = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actorType, actorId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', where: 'audit', action, message: err.message }));
  }
}
