import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DraftProvider } from "@/contexts/DraftContext";
import { useNotifications } from "@/hooks/useNotifications";

// Set API base URL from env at module load time
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // Register push token after login (native only)
  useNotifications(Platform.OS !== "web" ? isAuthenticated : false);

  // Notification tap deep-link disabled in Expo Go (expo-notifications not available)
  const lastResponse = null;
  useEffect(() => {
    if (!lastResponse) return;
    const data = lastResponse.notification.request.content.data as {
      type?: string;
      relatedEntityType?: string;
      relatedEntityId?: string;
    };
    if (!data?.type) return;
    switch (data.type) {
      case "SUBMISSION_APPROVED":
      case "SUBMISSION_REJECTED":
      case "RESUBMISSION_REQUIRED":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push("/(tabs)/submissions" as any);
        break;
      case "NEW_TASK":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push("/(tabs)/" as any);
        break;
      case "APP_NOTICE":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push("/(tabs)/" as any);
        break;
    }
  }, [lastResponse]);

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === "(auth)";
    if (!isAuthenticated && !inAuth) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuth) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace("/(tabs)/" as any);
    }
  }, [isAuthenticated, isLoading, segments]);

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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
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
