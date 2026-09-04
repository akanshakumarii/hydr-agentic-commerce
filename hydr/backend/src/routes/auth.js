import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { wrap } from '../middleware/errors.js';
import { validateBody, authRateLimit } from '../middleware/limits.js';
import { signSession, setSessionCookie, clearSessionCookie, requireAuth } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

const signupSchema = z.object({
  email: z.string().email('enter a valid email'),
  password: z.string().min(8, 'password must be at least 8 characters'),
  name: z.string().min(1).max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email('enter a valid email'),
  password: z.string().min(1, 'password is required'),
});

router.post('/signup', authRateLimit, validateBody(signupSchema), wrap(async (req, res) => {
  const { email, password, name } = req.body;
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) throw new AppError(409, 'email_taken', 'An account with that email already exists.');

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email, name, role`,
    [email.toLowerCase(), hash, name || null]
  );
  const user = rows[0];
  const token = signSession(user);
  setSessionCookie(res, token);
  await audit({ actorType: 'user', actorId: user.id, action: 'auth.signup', entityType: 'user', entityId: user.id });
  res.status(201).json({ user });
}));

router.post('/login', authRateLimit, validateBody(loginSchema), wrap(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!rows.length) throw new AppError(401, 'invalid_credentials', 'Incorrect email or password.');
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) throw new AppError(401, 'invalid_credentials', 'Incorrect email or password.');

  const user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role };
  const token = signSession(user);
  setSessionCookie(res, token);
  await audit({ actorType: 'user', actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id });
  res.json({ user });
}));

router.post('/logout', wrap(async (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [req.user.id]);
  if (!rows.length) throw new AppError(404, 'user_not_found', 'Account not found.');
  res.json({ user: rows[0] });
}));

export default router;
