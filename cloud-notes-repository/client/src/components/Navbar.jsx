import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { store } from '../utils.js';
import Icon from './Icon.jsx';

// Light / dark switch. The saved choice is applied by a tiny script in index.html before the page paints.
function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.getAttribute('data-theme') === 'dark');
  function toggle() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('notes_theme', next);
    setDark(!dark);
  }
  return (
    <button className="btn btn-icon" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark"><Icon name="book" size={19} /></span>
          Student Notes
        </Link>
        {user ? (
          <>
            <nav className="nav-links" aria-label="Main">
              <NavLink to="/" end>Browse</NavLink>
              <NavLink to="/upload">Upload</NavLink>
              <NavLink to="/dashboard">Dashboard</NavLink>
              {user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
            </nav>
            <div className="nav-user">
              <ThemeToggle />
              <div className="who">
                <span className="avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</span>
                <span>{user.name}{user.role === 'admin' ? ' (admin)' : ''}</span>
              </div>
              <button className="btn btn-quiet btn-sm" onClick={() => { logout(); navigate('/login'); }}>
                <Icon name="logout" size={16} /> Log out
              </button>
            </div>
          </>
        ) : (
          <>
            <nav className="nav-links push-right" aria-label="Account">
              <NavLink to="/login">Log in</NavLink>
              <NavLink to="/register">Register</NavLink>
            </nav>
            <ThemeToggle />
          </>
        )}
      </div>
    </header>
  );
}
