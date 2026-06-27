import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StartupScreen } from "@/components/StartupScreen";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { reportRenderError, drainErrorQueue } from "@/lib/errorReporting";
import { recoverAllRecordingDrafts } from "@/lib/imuRecovery";
import { OfflineBanner } from "@/components/OfflineBanner";
import { DisabledAccountView } from "@/components/DisabledAccountView";
import { AuthProvider, useAuth, _notifyDisabled, isDisabledError, AuthState } from "@/contexts/AuthContext";
import { hasBeenPrompted } from "./referral-entry";
import { DraftProvider } from "@/contexts/DraftContext";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { useNotifications } from "@/hooks/useNotifications";

// expo-notifications throws at import time in Expo Go SDK 53+ — use safe require
let Notifications: typeof import("expo-notifications") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  Notifications = require("expo-notifications") as typeof import("expo-notifications");
} catch {
  Notifications = null;
}

// Set API base URL from env at module load time.
// Prefer EXPO_PUBLIC_API_BASE_URL (full URL, e.g. https://domain.com/api) when set.
// Strip the /api suffix because setBaseUrl expects the domain root, not the API path.
// Fallback to EXPO_PUBLIC_DOMAIN (domain-only, e.g. domain.com) for dev/web mode.
if (process.env.EXPO_PUBLIC_API_BASE_URL) {
  setBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL.replace(/\/api\/?$/, ''));
} else if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

SplashScreen.preventAutoHideAsync();

// QueryClient with global error handler to detect USER_ACCOUNT_DISABLED
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // served fresh for 5 min — no refetch on focus
      gcTime: 30 * 60 * 1000,      // kept in memory cache for 30 min (offline fallback)
      retry: (failureCount, error) => {
        // Never retry 4xx client errors
        const status = (error as { status?: number })?.status;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      if (isDisabledError(error)) _notifyDisabled();
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isDisabledError(error)) _notifyDisabled();
    },
  }),
});

function decodeJwtSub(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function RootLayoutNav({ onReady }: { onReady: () => void }) {
  const { isAuthenticated, isLoading, isDisabled, logout, accessToken } = useAuth() as AuthState & {
    isAuthenticated: boolean; logout: () => Promise<void>; accessToken: string | null;
  };
  const { hasSelectedLanguage, isLanguageLoading } = useLanguage();
  const router = useRouter();
  const segments = useSegments();

  // Register push token after login (native only)
  useNotifications(Platform.OS !== "web" ? isAuthenticated : false);

  // Deep-link: when a payout notification is tapped, navigate to payout-history
  useEffect(() => {
    if (!Notifications || !isAuthenticated) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      const type = data?.type as string | undefined;
      if (type === "PAYOUT_PAID" || type === "PAYOUT_REJECTED") {
        router.push("/payout-history" as never);
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, router]);

  // Hide splash once auth + language checks have resolved
  const readyFired = useRef(false);
  useEffect(() => {
    if (!isLoading && !isLanguageLoading && !readyFired.current) {
      readyFired.current = true;
      onReady();
      drainErrorQueue().catch(() => {});
      recoverAllRecordingDrafts().catch(() => {});
    }
  }, [isLoading, isLanguageLoading, onReady]);

  useEffect(() => {
    if (isLoading || isDisabled || isLanguageLoading) return;

    const inLangSelection = segments[0] === "language-selection";
    const inAuth = segments[0] === "(auth)";
    const inReferralEntry = segments[0] === "referral-entry";

    // First-time users: must pick a language before anything else
    if (!hasSelectedLanguage && !inLangSelection) {
      router.replace("/language-selection");
      return;
    }

    if (!hasSelectedLanguage) return; // waiting on language screen

    if (!isAuthenticated && !inAuth) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuth) {
      // After login: check if we should show the referral-entry screen
      const userId = accessToken ? decodeJwtSub(accessToken) : null;
      if (userId) {
        hasBeenPrompted(userId).then((prompted) => {
          if (!prompted) {
            router.replace("/referral-entry" as never);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.replace("/(tabs)/" as any);
          }
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace("/(tabs)/" as any);
      }
    } else if (isAuthenticated && !inAuth && !inReferralEntry) {
      // Already authenticated — nothing to do
    }
  }, [isAuthenticated, isLoading, isDisabled, isLanguageLoading, hasSelectedLanguage, segments, accessToken]);

  // While auth or language is still hydrating, don't render the Stack at all.
  // The native splash screen is still visible (SplashScreen.preventAutoHideAsync),
  // so the user sees nothing. This prevents any tab screen from mounting before
  // tokens are ready, which avoids 401s on first-load API calls.
  if (isLoading || isLanguageLoading) {
    return null;
  }

  // Full-screen disabled gate — replaces all navigation
  if (isDisabled) {
    return <DisabledAccountView onLogout={logout} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="language-selection" options={{ animation: "fade" }} />
      <Stack.Screen name="language-settings" options={{ presentation: "card" }} />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="category/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="subcategory/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="task/[id]" options={{ presentation: "card" }} />
      <Stack.Screen
        name="capture/video"
        options={{ presentation: "fullScreenModal", headerShown: false }}
      />
      <Stack.Screen
        name="capture/image"
        options={{ presentation: "fullScreenModal", headerShown: false }}
      />
      <Stack.Screen
        name="capture/audio"
        options={{ presentation: "fullScreenModal", headerShown: false }}
      />
      <Stack.Screen
        name="capture/review"
        options={{ presentation: "fullScreenModal", headerShown: false }}
      />
      <Stack.Screen name="support" options={{ presentation: "card", headerShown: false }} />
      <Stack.Screen name="faq" options={{ presentation: "card", headerShown: false }} />
      <Stack.Screen name="static-page" options={{ presentation: "card", headerShown: false }} />
      <Stack.Screen name="referral-entry" options={{ presentation: "modal", headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="referral" options={{ presentation: "card", headerShown: false }} />
      <Stack.Screen name="payout-history" options={{ presentation: "card", headerShown: false }} />
      <Stack.Screen name="notification-settings" options={{ presentation: "card", headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Single hide function — idempotent, safe to call multiple times
  const splashHiddenRef = useRef(false);
  const hideSplash = useCallback(async () => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    try {
      await SplashScreen.hideAsync();
    } catch {
      // Already hidden or never shown (web) — ignore
    }
  }, []);

  // Safety net: force-hide after 10 s so splash never freezes indefinitely
  useEffect(() => {
    const timer = setTimeout(hideSplash, 10_000);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  // While fonts are loading:
  //   • Native — native splash is still showing (preventAutoHideAsync keeps it up).
  //   • Web — no native splash, so show the in-app StartupScreen.
  if (!fontsLoaded && !fontError) {
    return <StartupScreen />;
  }

  // Fonts ready. Render providers and pass hideSplash into RootLayoutNav.
  // The native splash is still visible; it will be hidden by RootLayoutNav
  // once auth + language checks both resolve.
  return (
    <SafeAreaProvider>
      <NetworkProvider>
        <ErrorBoundary onError={reportRenderError}>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <LanguageProvider>
                  <AuthProvider>
                    <DraftProvider>
                      <RootLayoutNav onReady={hideSplash} />
                      <OfflineBanner />
                    </DraftProvider>
                  </AuthProvider>
                </LanguageProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}
