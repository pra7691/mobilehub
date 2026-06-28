import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";

/**
 * Classifies the API base URL into one of three environment buckets.
 *
 * Local       — no URL set, or localhost
 * Staging     — the Replit dev-domain URL used by preview (QA) builds
 * Production  — the deployed *.replit.app URL or any custom domain
 */
export type EnvLabel = "Local" | "Staging" | "Production";

/**
 * Database tier label derived from the environment bucket.
 *
 * Development — local heliumdb (dev workflow)
 * Staging     — tarzi_staging DB (staging workflow, used by preview builds)
 * Production  — managed production database
 */
export type DbLabel = "Development" | "Staging" | "Production";

export interface EnvInfo {
  apiHost: string;
  envLabel: EnvLabel;
  dbLabel: DbLabel;
}

/**
 * Derive environment and database labels from the baked-in API URL and
 * app variant.  Never exposes connection strings or credentials.
 *
 * Rules:
 *   No URL / localhost                            → Local / Development
 *   *.replit.dev  +  appVariant === "preview"     → Staging / Staging
 *   *.replit.dev  +  other variant               → Local / Development  (Metro / EAS Dev)
 *   *.replit.app  (production autoscale)          → Production / Production
 *   any other hostname                            → Production / Production
 */
export function getEnvInfo(): EnvInfo {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  const variant = (Constants.expoConfig?.extra?.appVariant as string | undefined) ?? "";

  if (!raw || raw.startsWith("/")) {
    return { apiHost: "localhost", envLabel: "Local", dbLabel: "Development" };
  }

  let hostname = "localhost";
  try {
    hostname = new URL(raw).hostname;
  } catch {
    /* keep localhost */
  }

  if (!hostname || hostname === "localhost" || hostname.startsWith("127.")) {
    return { apiHost: "localhost", envLabel: "Local", dbLabel: "Development" };
  }

  if (hostname.includes("replit.app")) {
    return { apiHost: hostname, envLabel: "Production", dbLabel: "Production" };
  }

  if (hostname.includes("replit.dev")) {
    if (variant === "preview") {
      return { apiHost: hostname, envLabel: "Staging", dbLabel: "Staging" };
    }
    return { apiHost: hostname, envLabel: "Local", dbLabel: "Development" };
  }

  return { apiHost: hostname, envLabel: "Production", dbLabel: "Production" };
}

/**
 * Short label for the amber dev-mode banner strip.
 *
 * Detection rules:
 *   __DEV__ === true                              → "Metro"
 *   appVariant === "development"                  → "EAS Dev"
 *   appVariant === "preview"                      → "QA"
 *   otherwise                                     → null  (production — no banner)
 */
function getBuildMode(): string | null {
  if (__DEV__) return "Metro";
  const variant = Constants.expoConfig?.extra?.appVariant as string | undefined;
  if (variant === "development") return "EAS Dev";
  if (variant === "preview") return "QA";
  return null;
}

/**
 * Thin amber diagnostic strip shown only in non-production builds.
 *
 * Placement: bottom of the screen, above the system home indicator,
 * non-interactive so it never blocks touches.
 *
 * Label format:
 *   Metro local dev    → "Metro • Local"
 *   EAS Dev APK        → "EAS Dev • Local"
 *   Preview (QA) APK   → "QA • Staging"
 *   Production build   → (not rendered)
 */
export function EnvBanner() {
  const buildMode = getBuildMode();
  if (!buildMode) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { bottom } = useSafeAreaInsets();
  const { envLabel } = getEnvInfo();

  return (
    <View
      style={[styles.banner, { paddingBottom: Math.max(bottom, 4) }]}
      pointerEvents="none"
    >
      <Text style={styles.text} numberOfLines={1}>
        {buildMode} • {envLabel}
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
