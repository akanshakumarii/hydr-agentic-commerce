import rateLimit from 'express-rate-limit';
import { AppError } from './errors.js';

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20, // 20 chat turns / minute / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'You are sending messages too quickly. Please slow down.' },
});

export const externalAgentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30, // stricter than in-app since external callers are less trusted
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Rate limit exceeded for this API key.' },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' },
});

/** Validate req.body against a zod schema; throws a 400 AppError with a clear message on failure. */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      return next(new AppError(400, 'invalid_input', `Invalid input: ${first.path.join('.')} — ${first.message}`));
    }
    req.body = result.data;
    next();
  };
}
