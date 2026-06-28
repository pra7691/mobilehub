/**
 * Dev-only Expo config plugin — pre-warms the GMS Code Scanner module at app startup.
 *
 * ROOT CAUSE OF "Unable to start the scanner" in expo-dev-client QR scanner
 * ---------------------------------------------------------------------------
 * expo-dev-launcher uses GmsBarcodeScanning.startScan() (play-services-code-scanner).
 * This is a GMS dynamic module that is downloaded on first use via Google Play Services.
 * On a fresh APK install the module is not yet present, so the first startScan() call
 * immediately throws MlKitException("Unable to start the scanner").
 *
 * FIX
 * ---
 * Call ModuleInstall.getClient(this).deferredInstall(scanner) in Application.onCreate().
 * This schedules an asynchronous background download of the code-scanner module so it
 * is ready by the time the user opens the dev-client menu and taps "Scan QR Code".
 *
 * deferredInstall() is a fire-and-forget async operation that runs entirely in the
 * background. It is safe to call even if the module is already installed (no-op).
 *
 * PLUGIN PHASE
 * ------------
 * withFinalizedMod (android, finalized phase) — runs after all other mod phases so
 * that the prebuild-generated MainApplication.kt is already on disk.
 *
 * Only applied in development builds (APP_VARIANT=development). Production builds
 * never include this plugin.
 */

const { withFinalizedMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PREWARM_BLOCK = `
    // Pre-warm the GMS Code Scanner module so expo-dev-client QR scanner works on first tap.
    // Without this, GmsBarcodeScanning.startScan() throws MlKitException.UNAVAILABLE
    // ("Unable to start the scanner") on fresh APK installs because the dynamic GMS module
    // has not been downloaded yet. deferredInstall() triggers an async background download.
    try {
      val mlkitScannerOptions = com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions.Builder()
        .setBarcodeFormats(com.google.mlkit.vision.barcode.common.Barcode.FORMAT_QR_CODE)
        .build()
      val mlkitScanner = com.google.mlkit.vision.codescanner.GmsBarcodeScanning.getClient(
        this, mlkitScannerOptions
      )
      com.google.android.gms.common.moduleinstall.ModuleInstall.getClient(this)
        .deferredInstall(mlkitScanner)
    } catch (_: Exception) {
      // Non-fatal — GMS API may not be available on all configurations.
      // The expo-dev-launcher HomeViewModel retry patch handles the fallback case.
    }`;

const withMlKitPrewarm = (config) => {
  return withFinalizedMod(config, [
    'android',
    (config) => {
      const pkg = (config.android && config.android.package) || '';
      if (!pkg) {
        console.warn('[withMlKitPrewarm] android.package not found in config — skipping.');
        return config;
      }

      const pkgPath = pkg.replace(/\./g, '/');
      const mainApplicationPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        pkgPath,
        'MainApplication.kt'
      );

      if (!fs.existsSync(mainApplicationPath)) {
        console.warn('[withMlKitPrewarm] MainApplication.kt not found at: ' + mainApplicationPath + ' — skipping.');
        return config;
      }

      const original = fs.readFileSync(mainApplicationPath, 'utf8');

      if (original.includes('mlkitScanner') || original.includes('GmsBarcodeScanning')) {
        console.log('[withMlKitPrewarm] Already patched — skipping.');
        return config;
      }

      // Insert prewarm block after the first super.onCreate() call in Application.onCreate().
      const patched = original.replace(
        /(\bsuper\.onCreate\(\))/,
        `$1\n${PREWARM_BLOCK}`
      );

      if (patched === original) {
        console.warn('[withMlKitPrewarm] Could not find super.onCreate() in MainApplication.kt — skipping.');
        return config;
      }

      fs.writeFileSync(mainApplicationPath, patched);
      console.log('[withMlKitPrewarm] Patched MainApplication.kt: GMS Code Scanner pre-warm added to onCreate().');
      return config;
    },
  ]);
};

module.exports = withMlKitPrewarm;
