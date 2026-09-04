import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();


import { attachUser } from './middleware/auth.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errors.js';
import { logger } from './services/logger.js';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import wishlistRoutes from './routes/wishlist.js';
import addressRoutes from './routes/addresses.js';
import orderRoutes from './routes/orders.js';
import chatRoutes from './routes/chat.js';
import feedRoutes from './routes/feed.js';
import agentCheckoutRoutes from './routes/agentCheckout.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Supports a comma-separated list in FRONTEND_ORIGIN (e.g. for previewing on
// both localhost and 127.0.0.1, or staging + prod), and always allows the
// common local-dev hosts so a small mismatch doesn't silently break every
// request. Any origin not in this list is still rejected as before.

const allowedOrigins = new Set([
  ...(process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header (curl, server-to-server, same-origin) — allow.
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      logger.warn('cors_origin_rejected', { origin, allowed: [...allowedOrigins] });
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use('/images', express.static(path.join(__dirname, '../public/images'), { maxAge: '7d' }));

// Razorpay webhook needs the RAW body to verify its HMAC signature, so it's
// mounted before the global express.json() parser touches the body.
app.use('/api/orders/webhook', express.raw({ type: '*/*' }));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);

app.use((req, _res, next) => {
  logger.info('request', { method: req.method, path: req.path });
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'hydr-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/feed', feedRoutes);           // Direction 2: public catalog
app.use('/api/agent-checkout', agentCheckoutRoutes); // Direction 2: ACP-style, API-key gated
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info('server_started', { port: PORT, env: process.env.NODE_ENV });
});

process.on('unhandledRejection', (err) => {
  logger.error('unhandled_rejection', { message: err?.message });
});
process.on('uncaughtException', (err) => {
  logger.error('uncaught_exception', { message: err?.message });
});
