import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('parkhere_token') || null);
  const [loading, setLoading] = useState(true);

  // Load and verify user profile on initial mount
  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await apiRequest('/api/auth/me');
        if (res.success && res.data.user) {
          setUser({
            ...res.data.user,
            org: res.data.org,
            ownerProfile: res.data.ownerProfile
          });
        } else {
          logout();
        }
      } catch (err) {
        console.error('[auth] Failed to restore session:', err.message);
        logout();
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [token]);

  async function login(email, password) {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    if (res.success && res.data.token) {
      localStorage.setItem('parkhere_token', res.data.token);
      setToken(res.data.token);
      setUser({
        ...res.data.user,
        org: res.data.org,
        ownerProfile: res.data.ownerProfile
      });
      return res.data;
    }
    throw new Error(res.error || 'Login failed');
  }

  async function register(payload) {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: payload
    });

    if (res.success && res.data.token) {
      localStorage.setItem('parkhere_token', res.data.token);
      setToken(res.data.token);
      setUser({
        ...res.data.user,
        org: res.data.org,
        ownerProfile: res.data.ownerProfile
      });
      return res.data;
    }
    throw new Error(res.error || 'Registration failed');
  }

  function logout() {
    localStorage.removeItem('parkhere_token');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    if (!token) return;
    try {
      const res = await apiRequest('/api/auth/me');
      if (res.success && res.data.user) {
        setUser({
          ...res.data.user,
          org: res.data.org,
          ownerProfile: res.data.ownerProfile
        });
      }
    } catch (err) {
      console.error('[auth] Failed to refresh user profile:', err.message);
    }
  }

  const approvalStatus = user?.role === 'org_admin'
    ? user?.org?.approval_status
    : user?.role === 'owner'
    ? user?.ownerProfile?.approval_status
    : 'approved';

  const isApproved = user?.role === 'customer' || user?.role === 'platform_admin' || approvalStatus === 'approved';

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      register,
      logout,
      refreshUser,
      approvalStatus,
      isApproved
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
