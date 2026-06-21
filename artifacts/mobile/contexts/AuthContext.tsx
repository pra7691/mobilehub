import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { setAuthTokenGetter, refreshTokens } from "@workspace/api-client-react";

const TOKEN_KEY = "capto_access_token";
const REFRESH_KEY = "capto_refresh_token";
const REFRESH_BEFORE_EXPIRY_SEC = 60;

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isDisabled: boolean;
}

export interface AuthContextValue extends AuthState {
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Module-level bridge so QueryClient (created outside AuthProvider) can
// trigger the disabled state inside AuthProvider.
// ---------------------------------------------------------------------------
let _disabledSetter: ((v: boolean) => void) | null = null;

export function _notifyDisabled(): void {
  _disabledSetter?.(true);
}

// ---------------------------------------------------------------------------
// Helpers to detect USER_ACCOUNT_DISABLED errors from the API.
// ---------------------------------------------------------------------------
export function isDisabledError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; data?: unknown };
  if (e.status !== 403) return false;
  const data = e.data as Record<string, unknown> | null;
  return data?.code === "USER_ACCOUNT_DISABLED";
}

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
    isDisabled: false,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Register the module-level bridge so QueryClient can notify us
  useEffect(() => {
    _disabledSetter = (v) =>
      setState((prev) => ({ ...prev, isDisabled: v }));
    return () => { _disabledSetter = null; };
  }, []);

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
      } catch (error) {
        if (isDisabledError(error)) {
          // Mark disabled but clear tokens — subsequent login attempts will also fail
          await Promise.all([secureDelete(TOKEN_KEY), secureDelete(REFRESH_KEY)]);
          setState(prev => ({ ...prev, accessToken: null, refreshToken: null, isDisabled: true }));
          setAuthTokenGetter(null);
          return;
        }
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
        setState({ accessToken: null, refreshToken: null, isLoading: false, isDisabled: false });
        setAuthTokenGetter(null);
        return;
      }

      if (isExpired(accessToken)) {
        try {
          const result = await refreshTokens({ refreshToken });
          await Promise.all([
            secureSet(TOKEN_KEY, result.accessToken),
            secureSet(REFRESH_KEY, result.refreshToken),
          ]);
          setState({ accessToken: result.accessToken, refreshToken: result.refreshToken, isLoading: false, isDisabled: false });
          setAuthTokenGetter(() => result.accessToken);
          scheduleRefresh(result.accessToken, result.refreshToken);
        } catch (error) {
          await Promise.all([secureDelete(TOKEN_KEY), secureDelete(REFRESH_KEY)]);
          if (isDisabledError(error)) {
            setState({ accessToken: null, refreshToken: null, isLoading: false, isDisabled: true });
          } else {
            setState({ accessToken: null, refreshToken: null, isLoading: false, isDisabled: false });
          }
          setAuthTokenGetter(null);
        }
        return;
      }

      setState({ accessToken, refreshToken, isLoading: false, isDisabled: false });
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
    setState(prev => ({ ...prev, accessToken, refreshToken, isDisabled: false }));
    setAuthTokenGetter(() => accessToken);
    scheduleRefresh(accessToken, refreshToken);
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    clearTimer();
    await Promise.all([secureDelete(TOKEN_KEY), secureDelete(REFRESH_KEY)]);
    setState(prev => ({ ...prev, accessToken: null, refreshToken: null, isDisabled: false }));
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
