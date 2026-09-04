import { money } from '../../utils/money.js';

/** Photo cards for search_products / get_recommendations results. */
export function ProductGrid({ title, products, onAction }) {
  if (!products || !products.length) {
    return <div className="widget-card empty">No matching products found.</div>;
  }
  return (
    <div className="widget-card">
      {title && <h4>{title}</h4>}
      <div className="widget-product-grid">
        {products.map((p) => (
          <div className="widget-product" key={p.id}>
            <img src={p.image_url} alt={p.name} loading="lazy" />
            <div className="widget-product-body">
              <p className="wp-name">{p.name}</p>
              {p.skin_type && <p className="wp-meta muted">For {p.skin_type} skin</p>}
              <div className="wp-row">
                <strong>{money(p.price_paise)}</strong>
                {p.stock === 0 ? (
                  <span className="badge out">Out of stock</span>
                ) : p.stock <= 5 ? (
                  <span className="badge low">Only {p.stock} left</span>
                ) : null}
              </div>
              <div className="wp-actions">
                <button
                  className="secondary small"
                  disabled={p.stock === 0}
                  onClick={() => onAction(`Add ${p.name} to my cart`)}
                >
                  Add to cart
                </button>
                <button className="link-btn small" onClick={() => onAction(`Add ${p.name} to my wishlist`)}>
                  ♡ Wishlist
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Side-by-side card for compare_products. */
export function CompareView({ products, onAction }) {
  if (!products || products.length < 2) return null;
  return (
    <div className="widget-card">
      <h4>Comparing {products.length} products</h4>
      <div className="widget-compare">
        {products.map((p) => (
          <div className="compare-col" key={p.id}>
            <img src={p.image_url} alt={p.name} loading="lazy" />
            <p className="wp-name">{p.name}</p>
            <p className="muted">{p.description}</p>
            <ul className="compare-facts">
              <li><strong>Price:</strong> {money(p.price_paise)}</li>
              <li><strong>Skin type:</strong> {p.skin_type || 'all'}</li>
              <li><strong>Concerns:</strong> {(p.concerns || []).join(', ') || '—'}</li>
              <li><strong>Stock:</strong> {p.stock > 0 ? `${p.stock} available` : 'Out of stock'}</li>
            </ul>
            <button className="secondary small" disabled={p.stock === 0} onClick={() => onAction(`Add ${p.name} to my cart`)}>
              Add to cart
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cart summary — used for view_cart / add_to_cart / remove_from_cart. */
export function CartView({ cart, onAction }) {
  if (!cart) return null;
  const items = cart.items || [];
  return (
    <div className="widget-card">
      <h4>Your cart</h4>
      {items.length === 0 ? (
        <p className="muted">Your cart is empty.</p>
      ) : (
        <>
          <div className="widget-list">
            {items.map((i) => (
              <div className="widget-list-row" key={i.product_id}>
                <img src={i.image_url} alt={i.name} loading="lazy" />
                <div className="wlr-body">
                  <p className="wp-name">{i.name}</p>
                  <p className="muted">Qty {i.quantity} · {money(i.price_paise)} each</p>
                </div>
                <div className="wlr-actions">
                  <strong>{money(i.price_paise * i.quantity)}</strong>
                  <button className="link-btn small" onClick={() => onAction(`Remove ${i.name} from my cart`)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="widget-total">
            <span>Subtotal</span>
            <strong>{money(cart.subtotal_paise)}</strong>
          </div>
          <button onClick={() => onAction('Place my order')}>Place order</button>
        </>
      )}
    </div>
  );
}

/** Wishlist — used for view_wishlist / add_to_wishlist / remove_from_wishlist. */
export function WishlistView({ wishlist, onAction }) {
  if (!wishlist) return null;
  if (!wishlist.length) return <div className="widget-card empty">Your wishlist is empty.</div>;
  return (
    <div className="widget-card">
      <h4>Your wishlist</h4>
      <div className="widget-list">
        {wishlist.map((i) => (
          <div className="widget-list-row" key={i.product_id}>
            <img src={i.image_url} alt={i.name} loading="lazy" />
            <div className="wlr-body">
              <p className="wp-name">{i.name}</p>
              <p className="muted">{money(i.price_paise)}</p>
            </div>
            <div className="wlr-actions">
              <button className="secondary small" onClick={() => onAction(`Move ${i.name} from my wishlist to my cart`)}>
                Move to cart
              </button>
              <button className="link-btn small" onClick={() => onAction(`Remove ${i.name} from my wishlist`)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Saved addresses — list + edit/remove/set-default + an inline structured "add address" form.
 * Remove/set-default use exact address IDs via direct REST calls (not the LLM) — an address ID
 * is unambiguous, so there's no reason to route a delete through fuzzy natural-language matching
 * the way "remove the vitamin C serum from my cart" reasonably does. */
export function AddressesView({ addresses, onRemove, onSetDefault, formOpen, onToggleForm, onSaveAddress, saving, formError, editing, onStartEdit }) {
  const list = addresses || [];
  return (
    <div className="widget-card">
      <h4>Delivery addresses</h4>
      {list.length === 0 && <p className="muted">No saved addresses yet.</p>}
      <div className="widget-list">
        {list.map((a) => (
          <div className="widget-list-row address-row" key={a.id}>
            <div className="wlr-body">
              <p className="wp-name">
                {a.label ? `${a.label} — ` : ''}
                {a.full_name} {a.is_default && <span className="badge default">Default</span>}
              </p>
              <p className="muted">
                {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode} · {a.phone}
              </p>
            </div>
            <div className="wlr-actions column">
              {!a.is_default && (
                <button className="link-btn small" onClick={() => onSetDefault(a.id)}>Make default</button>
              )}
              <button className="link-btn small" onClick={() => onStartEdit(a)}>Edit</button>
              <button className="link-btn small" onClick={() => onRemove(a.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      {!formOpen ? (
        <button className="secondary small" onClick={() => onToggleForm(true)}>+ Add new address</button>
      ) : (
        <AddressForm
          initial={editing}
          saving={saving}
          error={formError}
          onCancel={() => onToggleForm(false)}
          onSubmit={onSaveAddress}
        />
      )}
    </div>
  );
}

/** Structured form — deliberately NOT routed through the LLM. A phone number or
 * pincode is safer typed into real fields than transcribed by a model; this posts
 * straight to /api/addresses, which shares the exact same commerce.js logic (and
 * audit trail) as the agent's own address tools. */
export function AddressForm({ initial, onSubmit, onCancel, saving, error }) {
  const submit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    onSubmit({
      label: fd.get('label') || undefined,
      full_name: fd.get('full_name'),
      phone: fd.get('phone'),
      line1: fd.get('line1'),
      line2: fd.get('line2') || undefined,
      city: fd.get('city'),
      state: fd.get('state'),
      pincode: fd.get('pincode'),
      is_default: fd.get('is_default') === 'on',
    });
  };

  return (
    <form className="address-form" onSubmit={submit}>
      <div className="af-grid">
        <input name="label" placeholder="Label (Home, Work)" defaultValue={initial?.label || ''} />
        <input name="full_name" placeholder="Full name" defaultValue={initial?.full_name || ''} required />
        <input name="phone" placeholder="Phone" defaultValue={initial?.phone || ''} required />
        <input name="line1" placeholder="Address line 1" defaultValue={initial?.line1 || ''} required className="span2" />
        <input name="line2" placeholder="Address line 2 (optional)" defaultValue={initial?.line2 || ''} className="span2" />
        <input name="city" placeholder="City" defaultValue={initial?.city || ''} required />
        <input name="state" placeholder="State" defaultValue={initial?.state || ''} required />
        <input name="pincode" placeholder="Pincode" defaultValue={initial?.pincode || ''} required />
        <label className="af-default">
          <input type="checkbox" name="is_default" defaultChecked={initial?.is_default || false} /> Set as default
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="wp-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Save address'}
        </button>
        <button type="button" className="secondary small" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** Past orders list — list_my_orders. */
export function OrdersView({ orders, onAction }) {
  if (!orders) return null;
  if (!orders.length) return <div className="widget-card empty">No orders yet.</div>;
  return (
    <div className="widget-card">
      <h4>Your orders</h4>
      <div className="widget-list">
        {orders.map((o) => (
          <div className="widget-list-row" key={o.id}>
            <div className="wlr-body">
              <p className="wp-name">Order {o.id.slice(0, 8)}</p>
              <p className="muted">{new Date(o.created_at).toLocaleDateString()} · {money(o.total_paise)}</p>
            </div>
            <div className="wlr-actions">
              <span className={`badge status-${o.status}`}>{o.status}</span>
              <button className="link-btn small" onClick={() => onAction(`Track order ${o.id}`)}>Track</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_STEPS = ['created', 'paid', 'shipped', 'delivered'];

/** Single order detail with a status timeline — track_order. */
export function OrderView({ order, items, history }) {
  if (!order) return null;
  const stepIndex = STATUS_STEPS.indexOf(order.status);
  const terminalBad = ['cancelled', 'return_requested', 'returned'].includes(order.status);
  return (
    <div className="widget-card">
      <h4>Order {order.id.slice(0, 8)}</h4>
      {!terminalBad ? (
        <div className="stepper">
          {STATUS_STEPS.map((s, i) => (
            <div key={s} className={`step ${i <= stepIndex ? 'done' : ''}`}>{s}</div>
          ))}
        </div>
      ) : (
        <p className={`badge status-${order.status}`}>{order.status.replace('_', ' ')}</p>
      )}
      <div className="widget-list">
        {(items || []).map((i) => (
          <div className="widget-list-row" key={i.id}>
            <div className="wlr-body">
              <p className="wp-name">{i.product_name}</p>
              <p className="muted">Qty {i.quantity} · {money(i.unit_price_paise)} each</p>
            </div>
            <strong>{money(i.unit_price_paise * i.quantity)}</strong>
          </div>
        ))}
      </div>
      <div className="widget-total">
        <span>Total</span>
        <strong>{money(order.total_paise)}</strong>
      </div>
      {history && history.length > 0 && (
        <details className="order-history">
          <summary>Status history</summary>
          <ul>
            {history.map((h) => (
              <li key={h.id}>{new Date(h.created_at).toLocaleString()} — {h.status}{h.note ? `: ${h.note}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Payment card — shown after place_order or pay_for_order. Tapping "Pay now"
 * opens the real Razorpay (test mode) checkout popup; this is the actual fix
 * for "does the agent open the payment page from chat" — it does, here. */
export function PaymentView({ order, payment, onPay, paying, paid }) {
  if (!order) return null;
  return (
    <div className="widget-card payment-card">
      <h4>Order {order.id.slice(0, 8)} created</h4>
      <p className="muted">Total due: <strong>{money(order.total_paise)}</strong></p>
      {paid ? (
        <p className="notice-text">✅ Payment received. Say "track my order" any time for status.</p>
      ) : payment ? (
        <button onClick={onPay} disabled={paying}>
          {paying ? 'Opening payment…' : `Pay ${money(order.total_paise)} now`}
        </button>
      ) : (
        <p className="error-text">
          Payment couldn't be started right now. Your order is saved as "created" — ask me to "pay for my order" to retry.
        </p>
      )}
    </div>
  );
}

