import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar.jsx';
import { Footer } from './components/Footer.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { Login, Signup } from './pages/Auth.jsx';
import ChatPage from './pages/ChatPage.jsx';
import Admin from './pages/Admin.jsx';
import { useAuth } from './context/AuthContext.jsx';

// HYDR-U (chat) is the only customer-facing surface now — no separate
// product/cart/wishlist/order pages. Everything routes through "/".
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted center-pad">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  // Admin gets its own dedicated header (see Admin.jsx) with no link back to
  // the chat — the customer Navbar is deliberately not shown here, so the
  // admin panel has no chatbot entry point.
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className="app-shell">
      {!isAdminRoute && <Navbar />}
      <main className="app-content">
        <ErrorBoundary>
          <Routes>
            <Route
              path="/"
              element={
                <RequireAuth>
                  <ChatPage />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/admin/*" element={<Admin />} />
            <Route
              path="*"
              element={
                <div className="empty-state">
                  <h3>Page not found</h3>
                  <p>That page doesn't exist. HYDR-U is at the homepage.</p>
                </div>
              }
            />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}