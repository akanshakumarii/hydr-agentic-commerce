import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { audit } from './audit.js';
import { checkFraud } from './fraud.js';

export async function searchProducts({ q, category, skinType, limit = 8 }) {
  const params = [];
  let where = 'is_active = true';
  if (category) {
    params.push(category);
    where += ` AND category ILIKE $${params.length}`;
  }
  if (skinType) {
    params.push(skinType);
    where += ` AND (skin_type ILIKE $${params.length} OR skin_type = 'all')`;
  }

  if (q && q.trim()) {
    params.push(q.trim());
    const qIdx = params.length;
    params.push(limit);
    const limIdx = params.length;
  
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT id, sku, name, brand, category, description, price_paise, stock, skin_type, concerns, image_url,
                GREATEST(word_similarity($${qIdx}, name), word_similarity($${qIdx}, description) * 0.6) AS score
         FROM products
         WHERE ${where}
       ) scored
       WHERE score > 0.3 OR name ILIKE '%' || $${qIdx} || '%'
       ORDER BY score DESC, name ASC
       LIMIT $${limIdx}`,
      params
    );
    return rows;
  }

  params.push(limit);
  const { rows } = await pool.query(
    `SELECT id, sku, name, brand, category, description, price_paise, stock, skin_type, concerns, image_url
     FROM products WHERE ${where} ORDER BY name ASC LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function getProductById(id) {
  const { rows } = await pool.query(`SELECT * FROM products WHERE id = $1 AND is_active = true`, [id]);
  if (!rows.length) throw new AppError(404, 'product_not_found', 'That product could not be found.');
  return rows[0];
}

/** Best-effort resolve of a user-typed product name/SKU to a real row (for agent use). */
export async function resolveProduct(nameOrSku) {
  const bySku = await pool.query(`SELECT * FROM products WHERE sku = $1 AND is_active = true`, [nameOrSku]);
  if (bySku.rows.length) return bySku.rows[0];
  const matches = await searchProducts({ q: nameOrSku, limit: 1 });
  if (!matches.length) return null;
  return getProductById(matches[0].id);
}

export async function compareProducts(ids) {
  if (!ids || ids.length < 2) throw new AppError(400, 'invalid_input', 'Provide at least two products to compare.');
  const { rows } = await pool.query(`SELECT * FROM products WHERE id = ANY($1::uuid[]) AND is_active = true`, [ids]);
  if (rows.length < 2) throw new AppError(404, 'product_not_found', 'One or more products could not be found.');
  return rows;
}

// ---------- Cart ----------

export async function getCart(userId) {
  const { rows } = await pool.query(
    `SELECT ci.id, ci.quantity, p.id AS product_id, p.name, p.price_paise, p.stock, p.image_url
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1 ORDER BY ci.created_at ASC`,
    [userId]
  );
  const subtotal_paise = rows.reduce((sum, r) => sum + r.price_paise * r.quantity, 0);
  return { items: rows, subtotal_paise };
}

export async function addToCart(userId, productId, quantity = 1) {
  const product = await getProductById(productId);
  if (product.stock < 1) throw new AppError(409, 'out_of_stock', `${product.name} is currently out of stock.`);
  const { rows } = await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
     RETURNING *`,
    [userId, productId, Math.max(1, Math.min(quantity, product.stock))]
  );
  await audit({ actorType: 'user', actorId: userId, action: 'cart.add', entityType: 'product', entityId: productId, metadata: { quantity } });
  return { cartItem: rows[0], cart: await getCart(userId) };
}

export async function removeFromCart(userId, productId) {
  await pool.query(`DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
  await audit({ actorType: 'user', actorId: userId, action: 'cart.remove', entityType: 'product', entityId: productId });
  return getCart(userId);
}

export async function updateCartQuantity(userId, productId, quantity) {
  if (quantity <= 0) return removeFromCart(userId, productId);
  await pool.query(`UPDATE cart_items SET quantity = $3 WHERE user_id = $1 AND product_id = $2`, [userId, productId, quantity]);
  return getCart(userId);
}

// ---------- Wishlist ----------

export async function getWishlist(userId) {
  const { rows } = await pool.query(
    `SELECT wi.id, p.id AS product_id, p.name, p.price_paise, p.stock, p.image_url
     FROM wishlist_items wi JOIN products p ON p.id = wi.product_id
     WHERE wi.user_id = $1 ORDER BY wi.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function addToWishlist(userId, productId) {
  await getProductById(productId);
  await pool.query(
    `INSERT INTO wishlist_items (user_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [userId, productId]
  );
  await audit({ actorType: 'user', actorId: userId, action: 'wishlist.add', entityType: 'product', entityId: productId });
  return getWishlist(userId);
}

export async function removeFromWishlist(userId, productId) {
  await pool.query(`DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2`, [userId, productId]);
  await audit({ actorType: 'user', actorId: userId, action: 'wishlist.remove', entityType: 'product', entityId: productId });
  return getWishlist(userId);
}

export async function moveWishlistToCart(userId, productId) {
  await addToCart(userId, productId, 1);
  await removeFromWishlist(userId, productId);
  return { cart: await getCart(userId), wishlist: await getWishlist(userId) };
}

// ---------- Addresses ----------
export async function listAddresses(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
    [userId]
  );
  return rows;
}

export async function getAddressById(userId, addressId) {
  const { rows } = await pool.query(`SELECT * FROM addresses WHERE id = $1 AND user_id = $2`, [addressId, userId]);
  if (!rows.length) throw new AppError(404, 'address_not_found', 'That address could not be found.');
  return rows[0];
}

export async function getDefaultAddress(userId) {
  const { rows } = await pool.query(`SELECT * FROM addresses WHERE user_id = $1 AND is_default = true LIMIT 1`, [userId]);
  return rows[0] || null;
}

export async function addAddress(userId, data) {
  const required = ['full_name', 'phone', 'line1', 'city', 'state', 'pincode'];
  for (const f of required) {
    if (!data[f] || !String(data[f]).trim()) {
      throw new AppError(400, 'invalid_address', `Address is missing ${f.replace('_', ' ')}.`);
    }
  }
  const existing = await listAddresses(userId);
  const makeDefault = data.is_default === true || existing.length === 0; // first saved address is always default
  const address = await withTransaction(async (client) => {
    if (makeDefault) await client.query(`UPDATE addresses SET is_default = false WHERE user_id = $1`, [userId]);
    const res = await client.query(
      `INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [userId, data.label || null, data.full_name, data.phone, data.line1, data.line2 || null, data.city, data.state, data.pincode, makeDefault]
    );
    return res.rows[0];
  });
  await audit({ actorType: 'user', actorId: userId, action: 'address.add', entityType: 'address', entityId: address.id });
  return listAddresses(userId);
}

export async function updateAddress(userId, addressId, data) {
  await getAddressById(userId, addressId); // ownership + existence check
  const fields = ['label', 'full_name', 'phone', 'line1', 'line2', 'city', 'state', 'pincode'];
  const sets = [];
  const params = [addressId, userId];
  for (const f of fields) {
    if (data[f] !== undefined) {
      params.push(data[f]);
      sets.push(`${f} = $${params.length}`);
    }
  }
  await withTransaction(async (client) => {
    if (sets.length) {
      await client.query(`UPDATE addresses SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`, params);
    }
    if (data.is_default === true) {
      await client.query(`UPDATE addresses SET is_default = false WHERE user_id = $1`, [userId]);
      await client.query(`UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2`, [addressId, userId]);
    }
  });
  await audit({ actorType: 'user', actorId: userId, action: 'address.update', entityType: 'address', entityId: addressId });
  return listAddresses(userId);
}

export async function removeAddress(userId, addressId) {
  const addr = await getAddressById(userId, addressId);
  await pool.query(`DELETE FROM addresses WHERE id = $1 AND user_id = $2`, [addressId, userId]);
  if (addr.is_default) {
    // Promote the oldest remaining address so the user is never left without a default silently.
    const { rows } = await pool.query(`SELECT id FROM addresses WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`, [userId]);
    if (rows.length) await pool.query(`UPDATE addresses SET is_default = true WHERE id = $1`, [rows[0].id]);
  }
  await audit({ actorType: 'user', actorId: userId, action: 'address.remove', entityType: 'address', entityId: addressId });
  return listAddresses(userId);
}

export async function setDefaultAddress(userId, addressId) {
  await getAddressById(userId, addressId);
  await withTransaction(async (client) => {
    await client.query(`UPDATE addresses SET is_default = false WHERE user_id = $1`, [userId]);
    await client.query(`UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2`, [addressId, userId]);
  });
  await audit({ actorType: 'user', actorId: userId, action: 'address.set_default', entityType: 'address', entityId: addressId });
  return listAddresses(userId);
}

// ---------- Coupons ----------

export async function validateCoupon(code) {
  if (!code) return null;
  const { rows } = await pool.query(
    `SELECT * FROM coupons WHERE code = $1 AND active = true AND expires_at > now()`,
    [code.toUpperCase()]
  );
  if (!rows.length) throw new AppError(400, 'invalid_coupon', 'That coupon is invalid or has expired.');
  return rows[0];
}

// ---------- Orders ----------

/**
 * Creates an order from the caller's current cart. Idempotency-key protected,
 * stock-checked, fraud-checked, and fully audited. Used by:
 *  - POST /api/orders (web_direct)
 *  - the in-app agent's place_order tool (in_app_agent)
 *  - the Direction-2 external checkout endpoints (external_agent)
 */
export async function createOrderFromCart({
  userId,
  guestEmail,
  cartOverride, // optional: [{product_id, quantity}] for guest/external checkout without a cart_items row
  couponCode,
  orderSource,
  externalAgentClientId = null,
  idempotencyKey,
  sessionKey, // IP or session id, used for velocity-based fraud checks
  shippingAddress = null,
  addressId = null, // optional: pick a specific saved address instead of the default (in_app_agent orders)
}) {
  if (idempotencyKey) {
    const existing = await pool.query(`SELECT response FROM idempotency_keys WHERE key = $1`, [idempotencyKey]);
    if (existing.rows.length) return existing.rows[0].response;
  }

  const items = cartOverride && cartOverride.length ? await hydrateOverrideItems(cartOverride) : (await getCart(userId)).items;
  if (!items.length) throw new AppError(400, 'empty_cart', 'Your cart is empty.');

  // Chat is now the only storefront surface, so an in-app-agent order must resolve
  // to a real saved address — no anonymous "type it once and forget it" checkout.
  // Guest/external checkouts keep working via an inline shippingAddress snapshot.
  let resolvedShippingAddress = shippingAddress;
  if (!resolvedShippingAddress && userId) {
    const addr = addressId ? await getAddressById(userId, addressId) : await getDefaultAddress(userId);
    if (!addr && orderSource === 'in_app_agent') {
      throw new AppError(
        400,
        'address_required',
        "You don't have a delivery address saved yet — tell me your delivery address (name, phone, address, city, state, pincode) and I'll save it, then place the order."
      );
    }
    if (addr) {
      resolvedShippingAddress = {
        label: addr.label, full_name: addr.full_name, phone: addr.phone,
        line1: addr.line1, line2: addr.line2, city: addr.city, state: addr.state, pincode: addr.pincode,
      };
    }
  }

  for (const item of items) {
    const fresh = await getProductById(item.product_id);
    if (fresh.stock < item.quantity) {
      throw new AppError(409, 'out_of_stock', `${fresh.name} only has ${fresh.stock} left in stock.`);
    }
  }

  const subtotal_paise = items.reduce((s, i) => s + i.price_paise * i.quantity, 0);
  let discount_paise = 0;
  const coupon = await validateCoupon(couponCode);
  if (coupon) discount_paise = Math.round((subtotal_paise * coupon.percent_off) / 100);
  const total_paise = subtotal_paise - discount_paise;

  const order = await withTransaction(async (client) => {
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, guest_email, order_source, external_agent_client_id, status,
                            subtotal_paise, discount_paise, total_paise, coupon_code, idempotency_key, shipping_address)
       VALUES ($1,$2,$3,$4,'created',$5,$6,$7,$8,$9,$10) RETURNING *`,
      [userId || null, guestEmail || null, orderSource, externalAgentClientId, subtotal_paise, discount_paise, total_paise,
       coupon?.code || null, idempotencyKey || null, resolvedShippingAddress ? JSON.stringify(resolvedShippingAddress) : null]
    );
    const order = orderRes.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price_paise, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, item.product_id, item.name, item.price_paise, item.quantity]
      );
      await client.query(`UPDATE products SET stock = stock - $2 WHERE id = $1`, [item.product_id, item.quantity]);
    }
    await client.query(`INSERT INTO order_status_history (order_id, status, note) VALUES ($1,'created','Order created')`, [order.id]);
    if (userId) await client.query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
    return order;
  });

  await audit({
    actorType: orderSource === 'external_agent' ? 'external_agent' : orderSource === 'in_app_agent' ? 'agent' : 'user',
    actorId: userId || externalAgentClientId || 'guest',
    action: 'order.create',
    entityType: 'order',
    entityId: order.id,
    metadata: { total_paise, item_count: items.length, order_source: orderSource },
  });

  // Fraud/anomaly screen — does not block order creation, but routes suspicious
  // orders into the review queue instead of letting them silently complete unflagged.
  await checkFraud({ order, items, userId, sessionKey });

  const response = { order, items };
  if (idempotencyKey) {
    await pool.query(
      `INSERT INTO idempotency_keys (key, response) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
      [idempotencyKey, JSON.stringify(response)]
    );
  }
  return response;
}

async function hydrateOverrideItems(cartOverride) {
  const out = [];
  for (const { product_id, quantity } of cartOverride) {
    const p = await getProductById(product_id);
    out.push({ product_id: p.id, name: p.name, price_paise: p.price_paise, quantity });
  }
  return out;
}

export async function getOrder(orderId) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!rows.length) throw new AppError(404, 'order_not_found', 'That order could not be found.');
  const items = await pool.query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId]);
  const history = await pool.query(`SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`, [orderId]);
  return { order: rows[0], items: items.rows, history: history.rows };
}

export async function listOrdersForUser(userId) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
  return rows;
}

export async function updateOrderStatus(orderId, status, note = null) {
  await withTransaction(async (client) => {
    await client.query(`UPDATE orders SET status = $2, updated_at = now() WHERE id = $1`, [orderId, status]);
    await client.query(`INSERT INTO order_status_history (order_id, status, note) VALUES ($1,$2,$3)`, [orderId, status, note]);
  });
  await audit({ actorType: 'system', action: 'order.status_change', entityType: 'order', entityId: orderId, metadata: { status, note } });
  return getOrder(orderId);
}

// ---------- Upsell / cross-sell ----------

/** "Customers who bought X also bought Y" plus margin-aware suggestion when price-equivalent. */
export async function getRecommendations(productId, { limit = 3 } = {}) {
  const alsoBought = await pool.query(
    `SELECT p.* FROM also_bought ab JOIN products p ON p.id = ab.also_product_id
     WHERE ab.product_id = $1 AND p.is_active = true ORDER BY ab.weight DESC LIMIT $2`,
    [productId, limit]
  );
  if (alsoBought.rows.length) return { type: 'also_bought', products: alsoBought.rows };

  // Fallback: margin-aware — same category, similar price, higher margin.
  const base = await getProductById(productId);
  const { rows } = await pool.query(
    `SELECT *, (price_paise - cost_paise) AS margin_paise FROM products
     WHERE category = $1 AND id != $2 AND is_active = true
       AND price_paise BETWEEN $3 AND $4
     ORDER BY margin_paise DESC LIMIT $5`,
    [base.category, productId, Math.round(base.price_paise * 0.7), Math.round(base.price_paise * 1.3), limit]
  );
  return { type: 'margin_aware', products: rows };
}
