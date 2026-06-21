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
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { reportRenderError, drainErrorQueue } from "@/lib/errorReporting";
import { OfflineBanner } from "@/components/OfflineBanner";
import { DisabledAccountView } from "@/components/DisabledAccountView";
import { AuthProvider, useAuth, _notifyDisabled, isDisabledError } from "@/contexts/AuthContext";
import { DraftProvider } from "@/contexts/DraftContext";
import { useNotifications } from "@/hooks/useNotifications";

// Set API base URL from env at module load time
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

SplashScreen.preventAutoHideAsync();

// QueryClient with global error handler to detect USER_ACCOUNT_DISABLED
const queryClient = new QueryClient({
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

function RootLayoutNav() {
  const { isAuthenticated, isLoading, isDisabled, logout } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // Register push token after login (native only)
  useNotifications(Platform.OS !== "web" ? isAuthenticated : false);

  // Notification tap deep-link disabled in Expo Go (expo-notifications not available)
  useEffect(() => {
    // No-op: push notification deep-link is disabled in this build
  }, []);

  useEffect(() => {
    if (isLoading || isDisabled) return;
    const inAuth = segments[0] === "(auth)";
    if (!isAuthenticated && !inAuth) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuth) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(tabs)/" as any);
    }
  }, [isAuthenticated, isLoading, isDisabled, segments]);

  // Full-screen disabled gate — replaces all navigation
  if (isDisabled) {
    return <DisabledAccountView onLogout={logout} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
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

  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
      setAppReady(true);
      // Drain any queued error reports from previous sessions
      drainErrorQueue().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!appReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary onError={reportRenderError}>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <DraftProvider>
                  <RootLayoutNav />
                  <OfflineBanner />
                </DraftProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
