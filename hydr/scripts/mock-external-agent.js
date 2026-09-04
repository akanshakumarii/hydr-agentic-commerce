/**
 * scripts/mock-external-agent.js
 *
 * Plays "the buyer's AI agent" — a completely separate script that only
 * talks to HYDR's public feed and Direction-2 (agent-to-agent) endpoints
 * over HTTP with an API key, exactly like a real third-party agent
 * (ChatGPT, an ACP-compatible buying agent, etc.) would. It does not touch
 * the database directly and does not share code with the backend.
 *
 * Usage:
 *   HYDR_API_KEY=hydr_ext_xxx node scripts/mock-external-agent.js
 *
 * Get the API key by running `npm run seed` in backend/ (it prints a demo
 * key) or by creating one in the admin panel under "External agents".
 */

const BASE = process.env.HYDR_BASE_URL || 'http://localhost:4000';
const API_KEY = process.env.HYDR_API_KEY;

if (!API_KEY) {
  console.error('Set HYDR_API_KEY to a key from external_agent_clients (see backend seed output or the admin panel).');
  process.exit(1);
}

async function call(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${data.message || data.error}`);
  }
  return data;
}

async function main() {
  console.log('🤖 Mock external buying agent starting...\n');

  console.log('1. Reading the public product feed (no auth needed)...');
  const feedRes = await fetch(`${BASE}/api/feed`);
  const feed = await feedRes.json();
  console.log(`   Found ${feed.products.length} products from ${feed.merchant}.`);

  // Pick two cheap, in-stock items to buy — like an agent optimizing for budget.
  const affordable = feed.products.filter((p) => p.in_stock).sort((a, b) => a.price - b.price).slice(0, 2);
  if (affordable.length === 0) throw new Error('No in-stock products to buy.');
  console.log(`   Selecting: ${affordable.map((p) => p.name).join(', ')}\n`);

  const items = affordable.map((p) => ({ product_id: p.id, quantity: 1 }));

  console.log('2. create_checkout — pricing the draft cart...');
  const draft = await call('/api/agent-checkout/create_checkout', { method: 'POST', body: JSON.stringify({ items }) });
  console.log(`   Subtotal: ₹${(draft.subtotal_paise / 100).toFixed(2)}, Total: ₹${(draft.total_paise / 100).toFixed(2)}\n`);

  console.log('3. update_checkout — applying a coupon...');
  const updated = await call('/api/agent-checkout/update_checkout', {
    method: 'POST',
    body: JSON.stringify({ items, coupon_code: 'HYDR10' }),
  });
  console.log(`   Total after coupon: ₹${(updated.total_paise / 100).toFixed(2)} (coupon applied: ${updated.coupon_applied || 'none'})\n`);

  console.log('4. complete_checkout — placing the real order...');
  const idempotencyKey = `mock-agent-${Date.now()}`;
  const completed = await call('/api/agent-checkout/complete_checkout', {
    method: 'POST',
    body: JSON.stringify({
      items,
      coupon_code: 'HYDR10',
      buyer_email: 'buyer-agent-demo@example.com',
      shipping_address: { line1: '221B Baker Street', city: 'Bengaluru', pincode: '560001' },
      idempotency_key: idempotencyKey,
    }),
  });
  console.log(`   Order created: ${completed.order.id}`);
  console.log(`   order_source: ${completed.order.order_source}`);
  console.log(`   Total charged: ₹${(completed.order.total_paise / 100).toFixed(2)}`);
  if (completed.razorpay) {
    console.log(`   Razorpay order id (test mode): ${completed.razorpay.order_id}`);
    console.log('   (In a real agent flow, the buying agent would now complete payment via Razorpay/ACP payment handoff.)');
  }

  console.log('\n5. Re-running complete_checkout with the SAME idempotency key to prove safety...');
  const replay = await call('/api/agent-checkout/complete_checkout', {
    method: 'POST',
    body: JSON.stringify({
      items,
      coupon_code: 'HYDR10',
      buyer_email: 'buyer-agent-demo@example.com',
      idempotency_key: idempotencyKey,
    }),
  });
  console.log(`   Returned the same order id: ${replay.order.id === completed.order.id ? 'YES ✅ (no duplicate order)' : 'NO ❌'}`);

  console.log('\nMock external agent finished. Check the admin panel -> External agents to see this client\'s volume.');
}

main().catch((err) => {
  console.error('\n Mock agent run failed:', err.message);
  process.exit(1);
});
