import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { setAuthTokenGetter, refreshTokens } from "@workspace/api-client-react";

const TOKEN_KEY = "capto_access_token";
const REFRESH_KEY = "capto_refresh_token";
const REFRESH_BEFORE_EXPIRY_SEC = 60;

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") { localStorage.setItem(key, value); return; }
  return SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") { localStorage.removeItem(key); return; }
  return SecureStore.deleteItemAsync(key);
}

function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const exp = decodeJwtExp(token);
  return !exp || Date.now() / 1000 >= exp;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    refreshToken: null,
    isLoading: true,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback((accessToken: string, storedRefreshToken: string) => {
    clearTimer();
    const exp = decodeJwtExp(accessToken);
    if (!exp) return;
    const msUntilRefresh = Math.max((exp - REFRESH_BEFORE_EXPIRY_SEC) * 1000 - Date.now(), 0);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const result = await refreshTokens({ refreshToken: storedRefreshToken });
        await Promise.all([
          secureSet(TOKEN_KEY, result.accessToken),
          secureSet(REFRESH_KEY, result.refreshToken),
        ]);
        setState(prev => ({ ...prev, accessToken: result.accessToken, refreshToken: result.refreshToken }));
        setAuthTokenGetter(() => result.accessToken);
        scheduleRefresh(result.accessToken, result.refreshToken);
      } catch {
        await Promise.all([secureDelete(TOKEN_KEY), secureDelete(REFRESH_KEY)]);
        setState(prev => ({ ...prev, accessToken: null, refreshToken: null }));
        setAuthTokenGetter(null);
      }
    }, msUntilRefresh);
  }, [clearTimer]);

  useEffect(() => {
    async function loadTokens() {
      const [accessToken, refreshToken] = await Promise.all([
        secureGet(TOKEN_KEY),
        secureGet(REFRESH_KEY),
      ]);

      if (!accessToken || !refreshToken) {
        setState({ accessToken: null, refreshToken: null, isLoading: false });
        setAuthTokenGetter(null);
        return;
      }

      if (isExpired(accessToken)) {
        // Try immediate refresh before marking ready
        try {
          const result = await refreshTokens({ refreshToken });
          await Promise.all([
            secureSet(TOKEN_KEY, result.accessToken),
            secureSet(REFRESH_KEY, result.refreshToken),
          ]);
          setState({ accessToken: result.accessToken, refreshToken: result.refreshToken, isLoading: false });
          setAuthTokenGetter(() => result.accessToken);
          scheduleRefresh(result.accessToken, result.refreshToken);
        } catch {
          await Promise.all([secureDelete(TOKEN_KEY), secureDelete(REFRESH_KEY)]);
          setState({ accessToken: null, refreshToken: null, isLoading: false });
          setAuthTokenGetter(null);
        }
        return;
      }

      setState({ accessToken, refreshToken, isLoading: false });
      setAuthTokenGetter(() => accessToken);
      scheduleRefresh(accessToken, refreshToken);
    }

    void loadTokens();
    return clearTimer;
  }, [scheduleRefresh, clearTimer]);

  const login = useCallback(async (accessToken: string, refreshToken: string) => {
    await Promise.all([
      secureSet(TOKEN_KEY, accessToken),
      secureSet(REFRESH_KEY, refreshToken),
    ]);
    setState(prev => ({ ...prev, accessToken, refreshToken }));
    setAuthTokenGetter(() => accessToken);
    scheduleRefresh(accessToken, refreshToken);
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    clearTimer();
    await Promise.all([secureDelete(TOKEN_KEY), secureDelete(REFRESH_KEY)]);
    setState(prev => ({ ...prev, accessToken: null, refreshToken: null }));
    setAuthTokenGetter(null);
  }, [clearTimer]);

  return (
    <AuthContext.Provider value={{
      ...state,
      isAuthenticated: !!state.accessToken,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
