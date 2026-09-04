import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function Login() {
  const { login, error: authError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState();
  const [password, setPassword] = useState();
  const [busy, setBusy] = useState(false);

    const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const loggedInUser = await login(email, password);
    setBusy(false);
    if (loggedInUser) navigate(loggedInUser.role === 'admin' ? '/admin' : '/');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Log in to <span className="brand-wordmark">HYDR</span></h2>
        <form onSubmit={submit} className="auth-fields">
          <div className="form-field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {authError && <p className="error-text">{authError}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="muted auth-switch">
          No account? <Link to="/signup">Sign up</Link>.
        </p>
      </div>
    </div>
  );
}

export function Signup() {
  const { signup, error: authError } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

    const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const newUser = await signup(email, password, name);
    setBusy(false);
    if (newUser) navigate(newUser.role === 'admin' ? '/admin' : '/');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>
          Create your <span className="brand-wordmark">HYDR</span> account
        </h2>
        <form onSubmit={submit} className="auth-fields">
          <div className="form-field">
            <label htmlFor="signup-name">Name</label>
            <input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="signup-email">Email</label>
            <input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {authError && <p className="error-text">{authError}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Sign up'}
          </button>
        </form>
        <p className="muted auth-switch">
          Already have an account? <Link to="/login">Log in</Link>.
        </p>
      </div>
    </div>
  );
}