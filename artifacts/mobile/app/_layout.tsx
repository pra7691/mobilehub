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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DraftProvider } from "@/contexts/DraftContext";

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
                </DraftProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
