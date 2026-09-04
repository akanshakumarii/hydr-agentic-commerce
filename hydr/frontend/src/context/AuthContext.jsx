import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = guest
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    setError(null);
    try {
      const data = await api.post('/auth/login', { email, password });
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const signup = async (email, password, name) => {
    setError(null);
    try {
      const data = await api.post('/auth/signup', { email, password, name });
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const logout = async () => {
    await api.post('/auth/logout', {}).catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading: user === undefined, error, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
