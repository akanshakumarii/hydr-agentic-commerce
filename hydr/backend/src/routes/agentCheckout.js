import { Router } from 'express';
import { z } from 'zod';
import { wrap, AppError } from '../middleware/errors.js';
import { validateBody, externalAgentRateLimit } from '../middleware/limits.js';
import { requireExternalAgent } from '../middleware/externalAgentAuth.js';
import { getProductById, createOrderFromCart, validateCoupon } from '../services/commerce.js';
import { createRazorpayOrder } from '../services/razorpay.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(requireExternalAgent, externalAgentRateLimit);

const itemSchema = z.object({ product_id: z.string().uuid(), quantity: z.number().int().positive() });
const checkoutSchema = z.object({
  items: z.array(itemSchema).min(1),
  coupon_code: z.string().optional(),
});

async function priceCheckout(items, couponCode) {
  const lines = [];
  for (const { product_id, quantity } of items) {
    const p = await getProductById(product_id);
    lines.push({
      product_id: p.id,
      name: p.name,
      unit_price_paise: p.price_paise,
      quantity,
      in_stock: p.stock >= quantity,
      available_stock: p.stock,
    });
  }
  const subtotal_paise = lines.reduce((s, l) => s + l.unit_price_paise * l.quantity, 0);
  let discount_paise = 0;
  const coupon = await validateCoupon(couponCode).catch(() => null);
  if (coupon) discount_paise = Math.round((subtotal_paise * coupon.percent_off) / 100);
  return { lines, subtotal_paise, discount_paise, total_paise: subtotal_paise - discount_paise, coupon_applied: coupon?.code || null };
}

/** create_checkout: price and validate a draft cart, no order created yet. */
router.post('/create_checkout', validateBody(checkoutSchema), wrap(async (req, res) => {
  const priced = await priceCheckout(req.body.items, req.body.coupon_code);
  await audit({ actorType: 'external_agent', actorId: req.externalAgent.id, action: 'checkout.create', metadata: { client: req.externalAgent.name } });
  res.status(201).json({ status: 'draft', ...priced });
}));

/** update_checkout: re-price after the buying agent changes quantities/coupon. */
router.post('/update_checkout', validateBody(checkoutSchema), wrap(async (req, res) => {
  const priced = await priceCheckout(req.body.items, req.body.coupon_code);
  res.json({ status: 'draft', ...priced });
}));

/** complete_checkout: actually places the order, tagged order_source = external_agent. */
router.post(
  '/complete_checkout',
  validateBody(
    checkoutSchema.extend({
      buyer_email: z.string().email(),
      shipping_address: z.record(z.any()).optional(),
      idempotency_key: z.string().min(8),
    })
  ),
  wrap(async (req, res) => {
    const { order, items } = await createOrderFromCart({
      guestEmail: req.body.buyer_email,
      cartOverride: req.body.items,
      couponCode: req.body.coupon_code,
      orderSource: 'external_agent',
      externalAgentClientId: req.externalAgent.id,
      idempotencyKey: req.body.idempotency_key,
      sessionKey: `agent:${req.externalAgent.id}`,
      shippingAddress: req.body.shipping_address || null,
    });

    let razorpayOrder = null;
    try {
      razorpayOrder = await createRazorpayOrder({ amountPaise: order.total_paise, receiptId: order.id });
    } catch {
      // Order still exists; the buying agent can complete payment via the returned order id.
    }

    await audit({
      actorType: 'external_agent',
      actorId: req.externalAgent.id,
      action: 'checkout.complete',
      entityType: 'order',
      entityId: order.id,
      metadata: { client: req.externalAgent.name, total_paise: order.total_paise },
    });

    res.status(201).json({
      status: 'order_created',
      order,
      items,
      razorpay: razorpayOrder ? { order_id: razorpayOrder.id, key_id: process.env.RAZORPAY_KEY_ID, amount: razorpayOrder.amount } : null,
    });
  })
);

export default router;
