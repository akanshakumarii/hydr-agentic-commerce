import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// HYDR-U is the entire storefront now, so there's nothing left to link to
// except the brand itself, the separately-authenticated admin panel, and logout.

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  return (
    <nav className="navbar">
      {/* If an admin ever sees this navbar mid-redirect, the brand link must
          not offer a path back to the chat. */}
      <Link to={isAdmin ? '/admin' : '/'} className="brand brand-wordmark">HYDR</Link>
      <div className="nav-links">
        {isAdmin && <Link to="/admin">Admin</Link>}
        {user === null && <Link to="/login">Log in</Link>}
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
      </div>
    </nav>
  );
}