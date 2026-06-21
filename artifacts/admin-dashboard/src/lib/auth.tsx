import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setAuthTokenGetter, refreshTokens } from '@workspace/api-client-react';

const ACCESS_KEY = 'capto_admin_token';
const REFRESH_KEY = 'capto_admin_refresh_token';
const REFRESH_THRESHOLD_SEC = 60; // refresh when < 60s left

interface AuthContextType {
  token: string | null;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const exp = decodeJwtExp(token);
  if (!exp) return true;
  return Date.now() / 1000 >= exp;
}

function isNearExpiry(token: string): boolean {
  const exp = decodeJwtExp(token);
  if (!exp) return true;
  return Date.now() / 1000 >= exp - REFRESH_THRESHOLD_SEC;
}

// Module-level refresh state to avoid concurrent refresh calls
let _refreshPromise: Promise<string | null> | null = null;

async function doRefresh(storedRefreshToken: string): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const result = await refreshTokens({ refreshToken: storedRefreshToken });
      localStorage.setItem(ACCESS_KEY, result.accessToken);
      localStorage.setItem(REFRESH_KEY, result.refreshToken);
      return result.accessToken;
    } catch {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

function wireAuthGetter(accessToken: string | null, refreshToken: string | null) {
  if (!accessToken) {
    setAuthTokenGetter(null);
    return;
  }
  setAuthTokenGetter(async () => {
    const currentAccess = localStorage.getItem(ACCESS_KEY);
    if (!currentAccess || isExpired(currentAccess)) {
      const rt = localStorage.getItem(REFRESH_KEY);
      if (!rt) return null;
      return doRefresh(rt);
    }
    if (isNearExpiry(currentAccess)) {
      const rt = localStorage.getItem(REFRESH_KEY);
      if (rt) {
        // refresh in background but return current token immediately
        void doRefresh(rt);
      }
    }
    return currentAccess;
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem(ACCESS_KEY);
    return stored && !isExpired(stored) ? stored : null;
  });

  // Wire up on initial mount (handles page reload with persisted tokens)
  useEffect(() => {
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (access && refresh && !isExpired(access)) {
      wireAuthGetter(access, refresh);
    } else if (access && refresh && isExpired(access)) {
      // Access expired but refresh available — try to refresh now
      void doRefresh(refresh).then((newAccess) => {
        if (newAccess) {
          setToken(newAccess);
          wireAuthGetter(newAccess, localStorage.getItem(REFRESH_KEY));
        } else {
          setToken(null);
        }
      });
    } else {
      wireAuthGetter(null, null);
    }
  }, []);

  const login = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    setToken(accessToken);
    wireAuthGetter(accessToken, refreshToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setToken(null);
    setAuthTokenGetter(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
