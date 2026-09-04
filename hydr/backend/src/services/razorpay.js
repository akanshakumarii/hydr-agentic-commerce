import Razorpay from 'razorpay';
import crypto from 'crypto';
import { AppError } from '../middleware/errors.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const CALL_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new AppError(504, 'timeout', `${label} timed out. Please try again.`)), ms)),
  ]);
}

/** Creates a Razorpay order in TEST MODE for a given amount (paise) and our internal order id. */
export async function createRazorpayOrder({ amountPaise, receiptId }) {
  try {
    const rpOrder = await withTimeout(
      razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: receiptId,
        notes: { source: 'HYDR' },
      }),
      CALL_TIMEOUT_MS,
      'Payment gateway'
    );
    return rpOrder;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'payment_gateway_error', 'We could not start the payment right now. Please try again in a moment.');
  }
}

/** Verifies the checkout.js success payload signature (client-submitted payment confirmation). */
export function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  return expected === razorpay_signature;
}

/** Verifies an inbound webhook's signature header against the raw request body. */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false; // length mismatch etc. => not equal
  }
}
