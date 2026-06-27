/**
 * Dev-only Expo config plugin — fixes expo-dev-client 6.x startup crash on SDK 54.
 *
 * ROOT CAUSE
 * ----------
 * expo-splash-screen's config plugin adds the following block to the prebuild-generated
 * MainActivity.kt so that Android doesn't restore stale UI state on launch:
 *
 *   override fun onCreate(savedInstanceState: Bundle?) {
 *       SplashScreenManager.registerOnActivity(this)
 *       super.onCreate(null)           ← expo-splash-screen writes null here
 *   }
 *
 * When expo-dev-client is present, DevLauncherController must intercept the activity
 * lifecycle BEFORE React context creation begins. super.onCreate(null) immediately
 * calls ReactActivityDelegate.onCreate(), which starts the React context. The
 * DevLauncherController detects this and throws:
 *
 *   java.lang.IllegalArgumentException:
 *       App react context shouldn't be created before
 *       DevLauncherController.initialize was called.
 *
 * FIX
 * ---
 * Replace super.onCreate(null) with super.onCreate(savedInstanceState).
 * ReactActivityDelegateWrapper then properly defers to DevLauncherController,
 * which can intercept the launch and show the dev-launcher menu before React
 * context is created. SplashScreenManager.registerOnActivity(this) is unaffected
 * because it is called before super.onCreate() and does not depend on the argument.
 *
 * PLUGIN PHASE
 * ------------
 * This plugin uses withFinalizedMod (finalized phase) which runs AFTER all other
 * mod phases including mainActivity. This guarantees that expo-splash-screen's
 * withAndroidSplashMainActivity has already:
 *   1. Injected SplashScreenManager.registerOnActivity(this) before super.onCreate(null)
 *   2. Written the complete MainActivity.kt to disk
 * Only then do we read the file and patch null → savedInstanceState.
 *
 * Only applied in development builds (APP_VARIANT=development). Production builds
 * never include this plugin and retain the original super.onCreate(null) behaviour.
 */

const { withFinalizedMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withDevClientMainActivity = (config) => {
  return withFinalizedMod(config, [
    'android',
    (config) => {
      const pkg = (config.android && config.android.package) || '';
      if (!pkg) {
        throw new Error('[withDevClientMainActivity] android.package not found in config.');
      }

      const pkgPath = pkg.replace(/\./g, '/');
      const mainActivityPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        pkgPath,
        'MainActivity.kt'
      );

      if (!fs.existsSync(mainActivityPath)) {
        throw new Error(
          '[withDevClientMainActivity] MainActivity.kt not found at: ' + mainActivityPath
        );
      }

      const original = fs.readFileSync(mainActivityPath, 'utf8');
      const patched = original.replace(/\bsuper\.onCreate\(null\)/g, 'super.onCreate(savedInstanceState)');

      if (patched === original) {
        throw new Error(
          '[withDevClientMainActivity] super.onCreate(null) not found in MainActivity.kt. ' +
          'expo-splash-screen may have changed its output format. ' +
          'Inspect the generated MainActivity.kt and update this plugin accordingly.'
        );
      }

      fs.writeFileSync(mainActivityPath, patched);
      console.log(
        '[withDevClientMainActivity] Patched MainActivity.kt:',
        'super.onCreate(null) → super.onCreate(savedInstanceState)'
      );

      return config;
    },
  ]);
};

module.exports = withDevClientMainActivity;
