import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [serverError, setServerError] = useState('');

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // If a token is saved, ask the backend who we are.
  const restore = useCallback(() => {
    if (!getToken()) return;
    setLoading(true);
    setServerError('');
    api
      .get('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch((err) => {
        // Forget the token only when the server says it is invalid (401).
        // If the server is merely unreachable, keep the login so a refresh later just works.
        if (err.status === 401) setToken(null);
        else setServerError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { restore(); }, [restore]);

  useEffect(() => {
    window.addEventListener('auth-expired', logout);
    return () => window.removeEventListener('auth-expired', logout);
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      loading,
      serverError,
      retry: restore,
      logout,
      async login(email, password) {
        const r = await api.post('/api/auth/login', { email, password });
        setToken(r.token);
        setUser(r.user);
      },
      async register(name, email, password) {
        const r = await api.post('/api/auth/register', { name, email, password });
        setToken(r.token);
        setUser(r.user);
      }
    }),
    [user, loading, serverError, restore, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
