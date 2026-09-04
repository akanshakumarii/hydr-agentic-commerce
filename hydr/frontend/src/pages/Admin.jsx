import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { money } from '../utils/money.js';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

function Guard({ children }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user?.role !== 'admin') navigate('/');
  }, [user, loading, navigate]);
  if (loading || user?.role !== 'admin') return <p className="muted">Checking access…</p>;
  return children;
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get('/admin/dashboard').then(setData).catch((err) => setError(err.message));
  }, []);
  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div>
      <h2>Dashboard</h2>
      <div className="stat-row">
        <div className="stat-card">
          <p className="muted">Total revenue</p>
          <h3>{money(data.totals.revenue_paise)}</h3>
        </div>
        <div className="stat-card">
          <p className="muted">Total orders</p>
          <h3>{data.totals.order_count}</h3>
        </div>
        <div className="stat-card">
          <p className="muted">Pending fraud review</p>
          <h3>{data.pending_fraud_review}</h3>
        </div>
        <div className="stat-card">
          <p className="muted">Pending return review</p>
          <h3>{data.pending_return_review}</h3>
        </div>
      </div>
      <h4>Revenue by channel</h4>
      <table className="cart-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Orders</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.by_source.map((s) => (
            <tr key={s.order_source}>
              <td>{s.order_source}</td>
              <td>{s.order_count}</td>
              <td>{money(s.revenue_paise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersList() {
  const [orders, setOrders] = useState(null);
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    const params = new URLSearchParams();
    if (source) params.set('source', source);
    if (status) params.set('status', status);
    api
      .get(`/admin/orders?${params.toString()}`)
      .then((d) => setOrders(d.orders))
      .catch((err) => setError(err.message));
  };
  useEffect(load, [source, status]);

  const viewAudit = async (id) => {
    try {
      const d = await api.get(`/admin/orders/${id}/audit`);
      setAudit({ id, ...d });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>Orders</h2>
      <div className="filter-row">
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          <option value="web_direct">web_direct</option>
          <option value="in_app_agent">in_app_agent</option>
          <option value="external_agent">external_agent</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="created">created</option>
          <option value="paid">paid</option>
          <option value="shipped">shipped</option>
          <option value="delivered">delivered</option>
          <option value="cancelled">cancelled</option>
        </select>
      </div>
      
           {!orders ? (
        <p className="muted">Loading…</p>
      ) : error ? (
        <p className="error-text">{error} <button className="link-btn" onClick={load}>Retry</button></p>
      ) : (
        <table className="cart-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Source</th>
              <th>Status</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id.slice(0, 8)}</td>
                <td>{o.order_source}</td>
                <td>{o.status}</td>
                <td>{money(o.total_paise)}</td>
                <td>
                  <button className="link-btn" onClick={() => viewAudit(o.id)}>
                    Audit trail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {audit && (
        <div className="audit-panel">
          <h4>Audit trail — {audit.id.slice(0, 8)}</h4>
          <ul>
            {audit.audit.map((a) => (
              <li key={a.id}>
                {new Date(a.created_at).toLocaleString()} — <strong>{a.action}</strong> by {a.actor_type}:{String(a.actor_id).slice(0, 8)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FraudQueue() {
  const [flags, setFlags] = useState(null);
  const [error, setError] = useState(null);
  const load = () => {
    setError(null);
    api
      .get('/admin/fraud-queue')
      .then((d) => setFlags(d.flags))
      .catch((err) => setError(err.message));
  };
  useEffect(load, []);
  const review = async (id, decision) => {
    try {
      await api.post(`/admin/fraud-queue/${id}/review`, { decision });
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  if (error) return <p className="error-text">{error} <button className="link-btn" onClick={load}>Retry</button></p>;
  if (!flags) return <p className="muted">Loading…</p>;
  if (flags.length === 0) return <EmptyState title="Nothing to review" message="No flagged orders right now." />;
  return (
    <div>
      <h2>Fraud review queue</h2>
      {flags.map((f) => (
        <div key={f.id} className="stat-card" style={{ marginBottom: 12 }}>
          <p>
            Order {f.order_id ? f.order_id.slice(0, 8) : '—'} — score {f.score ?? '—'} — {money(f.total_paise ?? 0)} ({f.order_source ?? 'unknown'})
          </p>
          <p className="muted">{f.reason}</p>
          <div className="button-row">
            <button onClick={() => review(f.id, 'approve')}>Approve</button>
            <button className="secondary" onClick={() => review(f.id, 'reject')}>
              Reject &amp; cancel order
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExternalAgents() {
  const [clients, setClients] = useState(null);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState(null);
  const [error, setError] = useState(null);
  const load = () => {
    setError(null);
    api
      .get('/admin/external-agents')
      .then((d) => setClients(d.clients))
      .catch((err) => setError(err.message));
  };
  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const d = await api.post('/admin/external-agents', { name });
      setNewKey(d.client.api_key);
      setName('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const suspend = async (id) => {
    try {
      await api.post(`/admin/external-agents/${id}/suspend`, {});
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>External agent clients</h2>
      <form onSubmit={create} className="filter-row">
        <input placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit">Create API key</button>
      </form>
      {error && <p className="error-text">{error} <button className="link-btn" onClick={load}>Retry</button></p>}
      {newKey && (
        <p className="notice-text">
          New key (copy now, shown once): <code>{newKey}</code>
        </p>
      )}
      {!clients ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="cart-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Orders</th>
              <th>Revenue</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.status}</td>
                <td>{c.order_count ?? 0}</td>
                <td>{money(c.revenue_paise ?? 0)}</td>
                <td>
                  {c.status === 'active' && (
                    <button className="link-btn" onClick={() => suspend(c.id)}>
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/fraud', label: 'Fraud queue' },
  { to: '/admin/agents', label: 'External agents' },
];

// Admin is a fully separate, full-width area — no shared Navbar, no link
// back to the HYDR-U chat, only these four sub-pages.
export default function Admin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Guard>
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <span className="brand-wordmark">HYDR</span>
            <span className="admin-tag">Admin</span>
          </div>
          {user && (
            <button
              className="link-btn"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Log out ({user.name || user.email})
            </button>
          )}
        </header>
        <div className="admin-body">
          <aside className="admin-sidebar">
            <ul>
              {NAV_ITEMS.map((item) => {
                const isActive = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
                return (
                  <li key={item.to}>
                    <Link to={item.to} className={isActive ? 'active' : ''}>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>
          <main className="admin-main">
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="orders" element={<OrdersList />} />
              <Route path="fraud" element={<FraudQueue />} />
              <Route path="agents" element={<ExternalAgents />} />
            </Routes>
          </main>
        </div>
      </div>
    </Guard>
  );
}
