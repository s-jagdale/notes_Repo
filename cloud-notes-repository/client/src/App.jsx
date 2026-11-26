import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import HealthBanner from './components/HealthBanner.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Browse from './pages/Browse.jsx';
import Upload from './pages/Upload.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Admin from './pages/Admin.jsx';

function Protected({ children, adminOnly = false }) {
  const { user, loading, serverError, retry } = useAuth();
  if (loading) return <p className="center muted">Loading…</p>;
  if (!user && serverError)
    return (
      <div className="panel empty">
        <h3>Cannot reach the server</h3>
        <p className="muted">{serverError}</p>
        <button className="btn btn-primary" onClick={retry}>Try again</button>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

// React Router keeps the old scroll position when the page changes, so jump back to the top on every new page.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Navbar />
      <HealthBanner />
      <main className="container">
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/" element={<Protected><Browse /></Protected>} />
          <Route path="/upload" element={<Protected><Upload /></Protected>} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">Cloud-Based Student Notes Repository. Built with React, Node.js, MongoDB Atlas and Amazon S3.</footer>
    </>
  );
}
