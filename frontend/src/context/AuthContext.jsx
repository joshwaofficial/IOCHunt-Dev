import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  // Pre-load user from localStorage to prevent unauthenticated flash on reload
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem('iochunt_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Purge any legacy token from localStorage to prevent XSS exposure
    localStorage.removeItem('iochunt_token');

    // Verify session on mount with the backend
    axios.get('/api/auth/me')
      .then(res => {
        if (res.data?.user) {
          setUser(res.data.user);
          localStorage.setItem('iochunt_user', JSON.stringify(res.data.user));
        }
      })
      .catch((err) => {
        // Only clear user on explicit 401 Unauthorized
        if (err.response?.status === 401) {
          localStorage.removeItem('iochunt_user');
          setUser(null);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Global real-time force-logout push listener (0 clicks, instant across all pages)
  useEffect(() => {
    if (!user || !user.id) return;

    let sse = null;
    try {
      sse = new EventSource('/api/stream', { withCredentials: true });

      sse.addEventListener('session_revoked', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.user_id === user.id && (!data.tenant_id || data.tenant_id === user.tenant_id)) {
            if (sse) sse.close();
            localStorage.removeItem('iochunt_user');
            setUser(null);
            window.location.href = '/login?reason=session_terminated';
          }
        } catch (_) {}
      });
    } catch (_) {}

    return () => {
      if (sse) sse.close();
    };
  }, [user]);

  const login = async (username, password, workspace_id, confirm_takeover = false) => {
    const res = await axios.post('/api/auth/login', {
      username,
      password,
      workspace_id,
      confirm_takeover
    });
    if (res.data.mfa_required) {
      return { mfaRequired: true, tempToken: res.data.tempToken, workspace_id };
    }
    if (res.data.user) {
      localStorage.setItem('iochunt_user', JSON.stringify(res.data.user));
      setUser(res.data.user);
    }
    return { success: true };
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch (e) {
      console.warn('Logout API failed:', e);
    } finally {
      localStorage.removeItem('iochunt_user');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

