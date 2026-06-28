import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Derives a short human-readable label from the configured API base URL.
 *
 * EXPO_PUBLIC_API_BASE_URL examples and their labels:
 *   (not set / blank)                              → "Local API"
 *   https://abc123.replit.dev/api                  → "Dev API"
 *   https://abc123.replit.app/api                  → "Dev API"
 *   https://api.tarzi.app/api                      → "tarzi.app"
 */
function getApiLabel(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  if (!raw || raw.startsWith("/")) return "Local API";
  try {
    const hostname = new URL(raw).hostname;
    if (hostname === "localhost" || hostname.startsWith("127.")) return "Local API";
    if (hostname.includes("replit.dev") || hostname.includes("replit.app")) return "Dev API";
    // Use the last two domain labels so it stays short: "tarzi.app"
    return hostname.split(".").slice(-2).join(".");
  } catch {
    return "Dev API";
  }
}

/**
 * Returns the build mode label, or null when the app is a production build
 * and the banner must be hidden.
 *
 * Detection rules:
 *   __DEV__ === true                                → "Metro"   (npm/Metro dev server)
 *   EXPO_PUBLIC_APP_VARIANT === "development"        → "EAS Dev" (EAS Dev APK without Metro)
 *   otherwise                                       → null      (production — no banner)
 */
function getBuildMode(): string | null {
  // __DEV__ is true when the app is running under Metro (npm start / Expo Go).
  // It is false in any standalone APK/IPA regardless of EAS build profile.
  if (__DEV__) return "Metro";
  if (process.env.EXPO_PUBLIC_APP_VARIANT === "development") return "EAS Dev";
  return null;
}

/**
 * Thin amber diagnostic strip shown only in non-production builds.
 *
 * Placement: bottom of the screen, above the system home indicator,
 * non-interactive so it never blocks touches.
 *
 * Label format:
 *   Metro local dev    → "Metro • Local API"
 *   EAS Dev APK        → "EAS Dev • Dev API"   (or the actual API hostname)
 *   Production build   → (not rendered)
 */
export function EnvBanner() {
  const buildMode = getBuildMode();
  if (!buildMode) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { bottom } = useSafeAreaInsets();
  const apiLabel = getApiLabel();

  return (
    <View
      style={[styles.banner, { paddingBottom: Math.max(bottom, 4) }]}
      pointerEvents="none"
    >
      <Text style={styles.text} numberOfLines={1}>
        {buildMode} • {apiLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(202, 138, 4, 0.92)",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 3,
    zIndex: 9998,
  },
  text: {
    color: "#1c1917",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});
