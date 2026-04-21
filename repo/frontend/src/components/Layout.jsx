import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useSession } from '../context/SessionContext';

const NAV = [
  { to: '/',          label: 'Search' },
  { to: '/cart',      label: 'Cart' },
  { to: '/documents', label: 'Documents' },
  { to: '/finance',   label: 'Finance' },
  { to: '/admin',     label: 'Admin' },
  { to: '/privacy',   label: 'Privacy' },
];

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const { cart } = useCart();
  const { authState, login, logout } = useSession();
  const itemCount = cart?.items?.length ?? 0;

  const [showLogin, setShowLogin] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      await login(loginInput.trim());
      setShowLogin(false);
      setLoginInput('');
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <div className="layout">
      <header className="header">
        <span className="logo">MotorLot DealerOps</span>
        <nav className="nav">
          {NAV.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`nav-link${pathname === to ? ' active' : ''}`}
            >
              {label === 'Cart' && itemCount > 0 ? `Cart (${itemCount})` : label}
            </Link>
          ))}
        </nav>
        <div className="auth-status">
          {authState ? (
            <>
              <span className="auth-user">{authState.user.name} ({authState.user.role})</span>
              <button className="btn btn-sm" onClick={logout}>Log out</button>
            </>
          ) : showLogin ? (
            <form onSubmit={handleLogin} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                placeholder="User ID"
                value={loginInput}
                onChange={e => setLoginInput(e.target.value)}
                style={{ width: '180px' }}
                autoFocus
                required
              />
              <button className="btn btn-sm btn-primary" type="submit" disabled={loginLoading}>
                {loginLoading ? '…' : 'Login'}
              </button>
              <button className="btn btn-sm" type="button" onClick={() => { setShowLogin(false); setLoginError(null); }}>
                Cancel
              </button>
              {loginError && <span style={{ color: 'red', fontSize: '0.8rem' }}>{loginError}</span>}
            </form>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => setShowLogin(true)}>Log in</button>
          )}
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
