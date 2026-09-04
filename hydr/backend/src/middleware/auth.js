import jwt from 'jsonwebtoken';

const COOKIE_NAME = process.env.COOKIE_NAME || 'hydr_session';

export function signSession(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

/** Attaches req.user if a valid session cookie is present. Never rejects — guest checkout must work. */
export function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
  } catch {
    // Expired/invalid token: treat as guest rather than erroring the request.
  }
  next();
}

/** Use on routes that truly require a logged-in user (order history, chat history). */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required', message: 'Please log in to view this.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden', message: 'Admin access required.' });
  }
  next();
}
