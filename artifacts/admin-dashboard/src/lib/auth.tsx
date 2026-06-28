import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { setAuthTokenGetter, refreshTokens } from '@workspace/api-client-react';
import { AuthContext } from './auth-context';
export type { AuthContextType } from './auth-context';

const ACCESS_KEY = 'capto_admin_token';
const REFRESH_KEY = 'capto_admin_refresh_token';
const REFRESH_BEFORE_EXPIRY_SEC = 60;

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
  return !exp || Date.now() / 1000 >= exp;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem(ACCESS_KEY);
    return stored && !isExpired(stored) ? stored : null;
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback((accessToken: string, refreshToken: string) => {
    clearTimer();
    const exp = decodeJwtExp(accessToken);
    if (!exp) return;
    const msUntilRefresh = Math.max((exp - REFRESH_BEFORE_EXPIRY_SEC) * 1000 - Date.now(), 0);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const result = await refreshTokens({ refreshToken });
        localStorage.setItem(ACCESS_KEY, result.accessToken);
        localStorage.setItem(REFRESH_KEY, result.refreshToken);
        setToken(result.accessToken);
        setAuthTokenGetter(() => result.accessToken);
        scheduleRefresh(result.accessToken, result.refreshToken);
      } catch {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setToken(null);
        setAuthTokenGetter(null);
      }
    }, msUntilRefresh);
  }, [clearTimer]);

  // On mount: restore session or clear stale tokens
  useEffect(() => {
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);

    if (!access || !refresh) {
      setAuthTokenGetter(null);
      return;
    }

    if (isExpired(access)) {
      // Try to refresh immediately
      void (async () => {
        try {
          const result = await refreshTokens({ refreshToken: refresh });
          localStorage.setItem(ACCESS_KEY, result.accessToken);
          localStorage.setItem(REFRESH_KEY, result.refreshToken);
          setToken(result.accessToken);
          setAuthTokenGetter(() => result.accessToken);
          scheduleRefresh(result.accessToken, result.refreshToken);
        } catch {
          localStorage.removeItem(ACCESS_KEY);
          localStorage.removeItem(REFRESH_KEY);
          setToken(null);
          setAuthTokenGetter(null);
        }
      })();
    } else {
      setAuthTokenGetter(() => access);
      scheduleRefresh(access, refresh);
    }

    return clearTimer;
  }, [scheduleRefresh, clearTimer]);

  const login = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    setToken(accessToken);
    setAuthTokenGetter(() => accessToken);
    scheduleRefresh(accessToken, refreshToken);
  }, [scheduleRefresh]);

  const logout = useCallback(() => {
    clearTimer();
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setToken(null);
    setAuthTokenGetter(null);
  }, [clearTimer]);

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
