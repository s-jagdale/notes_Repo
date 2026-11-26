import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import Icon from '../components/Icon.jsx';

// Decorative shelf: one spine per semester. It carries no data, so it is hidden from screen readers.
const SHELF = [
  ['#3340C8', 120], ['#0B7F61', 150], ['#C2453D', 100], ['#7A4FE0', 170],
  ['#A85F00', 135], ['#0F7FA8', 160], ['#B83272', 110], ['#3340C8', 145]
];

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-intro">
        <h1>Every semester&rsquo;s notes, on one shelf.</h1>
        <p>Upload PDFs, find them by subject and semester, and download them from anywhere. The files stay private in Amazon S3.</p>
        <div className="shelf-art" aria-hidden="true">
          {SHELF.map(([color, h], i) => (
            <i key={i} style={{ '--c': color, height: h }}><span>Semester {i + 1}</span></i>
          ))}
        </div>
      </div>
      <form className="panel auth-card" onSubmit={submit}>
        <h2>{isRegister ? 'Create your account' : 'Log in to your notes'}</h2>
        {error && <div className="banner banner-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
        {isRegister && (
          <label>Full name<input value={form.name} onChange={set('name')} required minLength={2} maxLength={60} autoComplete="name" /></label>
        )}
        <label>E-mail<input type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></label>
        <label>Password
          <input type="password" value={form.password} onChange={set('password')} required minLength={8} maxLength={72}
            autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="At least 8 characters" />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}</button>
        <p className="muted center small">
          {isRegister ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}
        </p>
      </form>
    </div>
  );
}
