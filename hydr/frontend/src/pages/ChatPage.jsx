import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client.js';
import { EmptyState } from '../components/EmptyState.jsx';
import {
  ProductGrid, CompareView, CartView, WishlistView, AddressesView, OrdersView, OrderView, PaymentView,
} from '../components/chat/Widgets.jsx';
import { openRazorpayCheckout } from '../utils/razorpay.js';

export default function ChatPage() {
  const [sessions, setSessions] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [widgetState, setWidgetState] = useState({}); // key -> per-widget local UI state (form open, saving, paying...)
  const bottomRef = useRef(null);

  const newSession = async () => {
    try {
      const data = await api.post('/chat/sessions', { title: 'New conversation' });
      setSessions((s) => [data.session, ...(s || [])]);
      setActiveId(data.session.id);
      setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    api
      .get('/chat/sessions')
      .then((data) => {
        setSessions(data.sessions);
        if (data.sessions.length) setActiveId(data.sessions[0].id);
      })
      .catch((err) => {
        setError(err.message);
        setSessions([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Land straight in a fresh conversation — HYDR-U is the whole homepage now,
  // there's no separate landing page to browse before chatting.
  useEffect(() => {
    if (sessions !== null && sessions.length === 0) newSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  useEffect(() => {
    if (!activeId) return;
    api
      .get(`/chat/sessions/${activeId}/messages`)
      .then((d) => setMessages(d.messages))
      .catch((err) => setError(err.message));
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text || !activeId || sending) return;
    if (!textOverride) setInput('');
    setSending(true);
    setError(null);
    setMessages((m) => [...m, { id: `tmp-u-${Date.now()}`, role: 'user', content: text }]);
    try {
      const data = await api.post(`/chat/sessions/${activeId}/messages`, { message: text });
      setMessages((m) => [
        ...m,
        { id: `tmp-a-${Date.now()}`, role: 'assistant', content: data.reply, widgets: data.widgets || [] },
      ]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'HYDR-U is unavailable right now — please try again in a moment.';
      setMessages((m) => [...m, { id: `tmp-e-${Date.now()}`, role: 'assistant', content: msg, widgets: [] }]);
    } finally {
      setSending(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    send();
  };
  const quickAction = (text) => send(text);

  // ---- Per-widget local UI state (address form, payment button) ----
  const getWState = (key) => widgetState[key] || {};
  const setWState = (key, patch) => setWidgetState((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  // ---- Addresses: structured data goes straight to REST, not the LLM ----
  const saveAddress = async (key, editingId, payload) => {
    setWState(key, { saving: true, error: null });
    try {
      const data = editingId ? await api.patch(`/addresses/${editingId}`, payload) : await api.post('/addresses', payload);
      setWState(key, { saving: false, formOpen: false, editing: null, addressesOverride: data.addresses });
    } catch (err) {
      setWState(key, { saving: false, error: err.message });
    }
  };
  const removeAddress = async (key, addressId) => {
    try {
      const data = await api.delete(`/addresses/${addressId}`);
      setWState(key, { addressesOverride: data.addresses });
    } catch (err) {
      setWState(key, { error: err.message });
    }
  };
  const setDefaultAddress = async (key, addressId) => {
    try {
      const data = await api.post(`/addresses/${addressId}/default`, {});
      setWState(key, { addressesOverride: data.addresses });
    } catch (err) {
      setWState(key, { error: err.message });
    }
  };

  // ---- Payment: this is what actually opens the Razorpay checkout page from chat ----
  const payNow = async (key, order, payment) => {
    setWState(key, { paying: true, error: null });
    await openRazorpayCheckout({
      payment,
      onSuccess: async (response) => {
        try {
          await api.post(`/orders/${order.id}/verify-payment`, response);
          setWState(key, { paying: false, paid: true });
        } catch (err) {
          setWState(key, { paying: false, error: err.message });
        }
      },
      onFailed: (msg) => setWState(key, { paying: false, error: msg }),
      onDismiss: () => setWState(key, { paying: false }),
    });
  };

  const renderWidget = (msgId, widget, idx) => {
    const key = `${msgId}-${idx}`;
    const st = getWState(key);
    switch (widget.type) {
      case 'products':
        return <ProductGrid key={key} products={widget.products} onAction={quickAction} />;
      case 'compare':
        return <CompareView key={key} products={widget.products} onAction={quickAction} />;
      case 'cart':
        return <CartView key={key} cart={widget.cart} onAction={quickAction} />;
      case 'wishlist':
        return <WishlistView key={key} wishlist={widget.wishlist} onAction={quickAction} />;
      case 'addresses':
        return (
          <AddressesView
            key={key}
            addresses={st.addressesOverride || widget.addresses}
            onRemove={(id) => removeAddress(key, id)}
            onSetDefault={(id) => setDefaultAddress(key, id)}
            formOpen={!!st.formOpen}
            onToggleForm={(open) => setWState(key, { formOpen: open, editing: open ? st.editing : null, error: null })}
            onStartEdit={(addr) => setWState(key, { formOpen: true, editing: addr, error: null })}
            editing={st.editing}
            saving={!!st.saving}
            formError={st.error}
            onSaveAddress={(payload) => saveAddress(key, st.editing?.id, payload)}
          />
        );
      case 'orders':
        return <OrdersView key={key} orders={widget.orders} onAction={quickAction} />;
      case 'order':
        return <OrderView key={key} order={widget.order} items={widget.items} history={widget.history} />;
      case 'order_created':
      case 'payment':
        return (
          <PaymentView
            key={key}
            order={widget.order}
            payment={widget.payment}
            paying={!!st.paying}
            paid={!!st.paid}
            onPay={() => payNow(key, widget.order, widget.payment)}
          />
        );
      default:
        return null;
    }
  };

  if (sessions === null) {
    return <p className="muted center-pad">Loading HYDR…</p>;
  }

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <button onClick={newSession}>+ New chat</button>
        <ul>
          {(sessions || []).map((s) => (
            <li key={s.id} className={s.id === activeId ? 'active' : ''} onClick={() => setActiveId(s.id)}>
              {s.title || 'Conversation'}
            </li>
          ))}
        </ul>
      </aside>
            <main className="chat-main">
        <div className="chat-header">
          <span className="brand-wordmark">HYDR-U</span>
          <span className="tagline">Your HYDR shopping assistant</span>
        </div>
        <div className="chat-messages">
          {messages.length === 0 && (
            <EmptyState
              title={
                <>
                  Hi, I'm <span className="brand-wordmark">HYDR-U</span>
                </>
              }
              message={`Ask me anything — "show me a serum for oily skin", "what's in my cart", "add a delivery address", "compare the vitamin C and niacinamide serums", or "track my order".`}
            />
          )}
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.role}`}>
              <p>{m.content}</p>
              {m.role === 'assistant' && (m.widgets || []).map((w, i) => renderWidget(m.id, w, i))}
            </div>
          ))}
          {sending && <div className="chat-bubble assistant typing">HYDR-U is thinking…</div>}
          <div ref={bottomRef} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <form className="chat-input" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activeId ? 'Ask HYDR-U…' : 'Starting a new chat…'}
            disabled={!activeId || sending}
          />
          <button type="submit" disabled={!activeId || sending || !input.trim()}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
