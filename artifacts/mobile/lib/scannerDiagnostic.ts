/**
 * QR Scanner startup diagnostic (dev-only, Android only).
 *
 * Runs once at app startup when APP_VARIANT=development or __DEV__ is true.
 * Checks camera permission status and sends a diagnostic entry to the Error Logs
 * system so admin can correlate "Unable to start the scanner" failures with:
 *   - camera permission state at the time of launch
 *   - build/platform metadata
 *   - scanner library in use
 *
 * Error code: QR_SCANNER_START_FAILED
 *
 * Note: The scanner itself lives inside expo-dev-launcher native code (HomeViewModel.kt).
 * We cannot intercept the native MlKitException directly from JavaScript. This diagnostic
 * reports the ambient conditions (permission, platform, variant) so admin can determine
 * whether a failure was permission-related or a GMS module download timing issue.
 */

import { Platform, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import { reportError } from "./errorReporting";

let _hasSentThisSession = false;

/**
 * Call once at app startup (from the root layout) on dev Android builds.
 * Reads camera permission status and posts a diagnostic log entry to Error Logs.
 *
 * Sends at most once per app session (in-memory flag) to avoid log spam on
 * every hot reload.
 */
export async function sendScannerDiagnostic(): Promise<void> {
  if (_hasSentThisSession) return;
  _hasSentThisSession = true;

  const isDevBuild = __DEV__ || process.env.EXPO_PUBLIC_APP_VARIANT === "development";
  if (!isDevBuild || Platform.OS !== "android") return;

  let cameraPermissionStatus = "unknown";
  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.CAMERA
    );
    cameraPermissionStatus = granted ? "granted" : "denied";
  } catch {
    cameraPermissionStatus = "check_failed";
  }

  const appVersion = Constants.expoConfig?.version ?? "unknown";
  const buildNumber = Constants.expoConfig?.android?.versionCode?.toString() ?? "unknown";
  const appVariant = process.env.EXPO_PUBLIC_APP_VARIANT ?? (__DEV__ ? "metro-dev" : "unknown");

  await reportError({
    errorType: "UNKNOWN",
    errorCode: "QR_SCANNER_START_FAILED",
    message:
      "Dev-client QR scanner diagnostic: GmsBarcodeScanning (play-services-code-scanner:16.1.0) " +
      "may fail on first use if GMS dynamic module not yet downloaded. " +
      "If scanner worked: ignore. If 'Unable to start the scanner' seen: GMS module was not ready.",
    metadata: {
      scannerLibrary: "com.google.android.gms:play-services-code-scanner:16.1.0",
      scannerImplementation: "GmsBarcodeScanning.startScan() via expo-dev-launcher@6.0.21 HomeViewModel.kt",
      cameraPermissionStatus,
      appVariant,
      appVersion,
      buildNumber,
      platform: Platform.OS,
      platformVersion: Platform.Version,
      isDevBuild: true,
      note:
        "Fix applied: HomeViewModel.kt patched (retry after 3 s on first failure). " +
        "withMlKitPrewarm.js config plugin pre-warms module in Application.onCreate(). " +
        "Requires a fresh Dev APK to take effect.",
    },
  });
}
