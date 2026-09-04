import { logger } from '../services/logger.js';

/** Wrap async route handlers so thrown errors reach the global handler instead of crashing the process. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Express global error handler. No raw stack traces ever reach the client. */
export function globalErrorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const code = err.code || 'internal_error';
  logger.error('request_failed', {
    path: req.path,
    method: req.method,
    status,
    code,
    message: err.message,
    sessionId: req.headers['x-session-id'],
  });
  const message =
    status < 500
      ? err.message
      : 'Something went wrong on our end. Please try again — your cart and account are safe.';
  res.status(status).json({ error: code, message });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not_found', message: 'That page or resource does not exist.' });
}
