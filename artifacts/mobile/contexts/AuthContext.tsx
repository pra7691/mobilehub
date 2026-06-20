import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { setAuthTokenGetter } from "@workspace/api-client-react";

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

const TOKEN_KEY = "capto_access_token";
const REFRESH_KEY = "capto_refresh_token";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    refreshToken: null,
    isLoading: true,
  });

  useEffect(() => {
    async function loadTokens() {
      const [accessToken, refreshToken] = await Promise.all([
        secureGet(TOKEN_KEY),
        secureGet(REFRESH_KEY),
      ]);
      setState({ accessToken, refreshToken, isLoading: false });
    }
    loadTokens();
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => state.accessToken);
  }, [state.accessToken]);

  const login = useCallback(async (accessToken: string, refreshToken: string) => {
    await Promise.all([
      secureSet(TOKEN_KEY, accessToken),
      secureSet(REFRESH_KEY, refreshToken),
    ]);
    setState(prev => ({ ...prev, accessToken, refreshToken }));
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      secureDelete(TOKEN_KEY),
      secureDelete(REFRESH_KEY),
    ]);
    setState(prev => ({ ...prev, accessToken: null, refreshToken: null }));
  }, []);

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
