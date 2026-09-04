import { Router } from 'express';
import { z } from 'zod';
import { wrap, AppError } from '../middleware/errors.js';
import { requireAuth, attachUser } from '../middleware/auth.js';
import { validateBody } from '../middleware/limits.js';
import {
  createOrderFromCart, getOrder, listOrdersForUser, updateOrderStatus,
} from '../services/commerce.js';
import { evaluateReturnRequest } from '../services/fraud.js';
import { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } from '../services/razorpay.js';
import { audit } from '../services/audit.js';
import { logger } from '../services/logger.js';

const router = Router();

// ---- Logged-in checkout (web_direct) ----
router.post(
  '/',
  requireAuth,
  validateBody(z.object({ coupon_code: z.string().optional() })),
  wrap(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'] || undefined;
    const { order, items } = await createOrderFromCart({
      userId: req.user.id,
      couponCode: req.body.coupon_code,
      orderSource: 'web_direct',
      idempotencyKey,
      sessionKey: req.ip,
    });

    let razorpayOrder = null;
    try {
      razorpayOrder = await createRazorpayOrder({ amountPaise: order.total_paise, receiptId: order.id });
    } catch (err) {
      // Order already exists in our DB as 'created' — customer can retry payment without re-creating the order.
      logger.warn('razorpay_order_create_failed', { orderId: order.id, message: err.message });
    }

    res.status(201).json({
      order, items, razorpay: razorpayOrder ? { order_id: razorpayOrder.id, key_id: process.env.RAZORPAY_KEY_ID, amount: razorpayOrder.amount } : null,
    });
  })
);

// ---- Guest checkout: no account required ----
router.post(
  '/guest',
  validateBody(
    z.object({
      guest_email: z.string().email(),
      items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
      coupon_code: z.string().optional(),
    })
  ),
  wrap(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'] || undefined;
    const { order } = await createOrderFromCart({
      guestEmail: req.body.guest_email,
      cartOverride: req.body.items,
      couponCode: req.body.coupon_code,
      orderSource: 'web_direct',
      idempotencyKey,
      sessionKey: req.ip,
    });
    let razorpayOrder = null;
    try {
      razorpayOrder = await createRazorpayOrder({ amountPaise: order.total_paise, receiptId: order.id });
    } catch (err) {
      logger.warn('razorpay_order_create_failed', { orderId: order.id, message: err.message });
    }
    res.status(201).json({ order, razorpay: razorpayOrder ? { order_id: razorpayOrder.id, key_id: process.env.RAZORPAY_KEY_ID, amount: razorpayOrder.amount } : null });
  })
);

// ---- Client-side payment confirmation (checkout.js success handler) ----
router.post(
  '/:id/verify-payment',
  validateBody(
    z.object({
      razorpay_order_id: z.string(),
      razorpay_payment_id: z.string(),
      razorpay_signature: z.string(),
    })
  ),
  wrap(async (req, res) => {
    const ok = verifyPaymentSignature(req.body);
    if (!ok) {
      await audit({ actorType: 'system', action: 'payment.signature_invalid', entityType: 'order', entityId: req.params.id, metadata: req.body });
      throw new AppError(400, 'invalid_signature', 'Payment could not be verified. If money was deducted, it will be auto-refunded — contact support with your order id.');
    }
    const result = await updateOrderStatus(req.params.id, 'paid', 'Payment verified client-side');
    await audit({ actorType: 'system', action: 'payment.verified', entityType: 'order', entityId: req.params.id, metadata: { razorpay_payment_id: req.body.razorpay_payment_id } });
    res.json(result);
  })
);

// ---- Razorpay webhook: source of truth, independent of the client callback ----
// NOTE: mounted with express.raw() body parsing in index.js so the signature check
// runs against the exact bytes Razorpay signed.
router.post('/webhook', wrap(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const valid = verifyWebhookSignature(req.body, signature);
  if (!valid) {
    await audit({ actorType: 'system', action: 'webhook.signature_invalid', metadata: { headers: { sig: !!signature } } });
    throw new AppError(400, 'invalid_webhook_signature', 'Invalid webhook signature.');
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  const event = payload.event;
  const orderReceipt = payload.payload?.payment?.entity?.order_id
    ? payload.payload?.order?.entity?.receipt
    : payload.payload?.order?.entity?.receipt;

  logger.info('webhook_received', { event, orderReceipt });
  await audit({ actorType: 'system', action: `webhook.${event}`, metadata: { orderReceipt } });

  if (event === 'payment.captured' && orderReceipt) {
    await updateOrderStatus(orderReceipt, 'paid', 'Confirmed via Razorpay webhook').catch((err) =>
      logger.warn('webhook_status_update_failed', { orderReceipt, message: err.message })
    );
  }
  if (event === 'payment.failed' && orderReceipt) {
    await updateOrderStatus(orderReceipt, 'cancelled', 'Payment declined (webhook)').catch(() => {});
  }
  res.json({ received: true });
}));

// ---- History / tracking (require login: this is "real chat/order history tied to user_id") ----
router.get('/', requireAuth, wrap(async (req, res) => {
  res.json({ orders: await listOrdersForUser(req.user.id) });
}));

router.get('/:id', attachUser, wrap(async (req, res) => {
  const result = await getOrder(req.params.id);
  if (result.order.user_id && (!req.user || req.user.id !== result.order.user_id) && req.user?.role !== 'admin') {
    throw new AppError(403, 'forbidden', 'You do not have access to this order.');
  }
  res.json(result);
}));

router.post(
  '/:id/return',
  requireAuth,
  validateBody(z.object({ reason: z.string().min(1).max(500) })),
  wrap(async (req, res) => {
    const { order } = await getOrder(req.params.id);
    if (order.user_id !== req.user.id) throw new AppError(403, 'forbidden', 'You do not have access to this order.');
    const result = await evaluateReturnRequest({ orderId: order.id, userId: req.user.id, reason: req.body.reason });
    res.json(result);
  })
);

export default router;
