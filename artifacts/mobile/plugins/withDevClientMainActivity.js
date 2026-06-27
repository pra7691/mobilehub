/**
 * Dev-only Expo config plugin — fixes expo-dev-client 6.x startup crash on SDK 54.
 *
 * ROOT CAUSE
 * ----------
 * expo-splash-screen's config plugin adds the following block to the prebuild-generated
 * MainActivity.kt so that Android doesn't restore stale UI state on launch:
 *
 *   override fun onCreate(savedInstanceState: Bundle?) {
 *       super.onCreate(null)           ← line 23 of generated file
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
 * context is created.
 *
 * This dangerous mod fires LAST in the prebuild pipeline (after expo-splash-screen),
 * so it always patches the final generated MainActivity.kt.
 *
 * Only applied in development builds (APP_VARIANT=development). Production builds
 * never include this plugin and retain the original super.onCreate(null) behaviour.
 */

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withDevClientMainActivity = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const pkg = (config.android && config.android.package) || '';
      if (!pkg) {
        console.warn('[withDevClientMainActivity] android.package not found in config; skipping patch.');
        return config;
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
        console.warn('[withDevClientMainActivity] MainActivity.kt not found at:', mainActivityPath, '— skipping patch.');
        return config;
      }

      const original = fs.readFileSync(mainActivityPath, 'utf8');

      // Replace every super.onCreate(null) call with super.onCreate(savedInstanceState).
      // This is safe because:
      //  - The dev-launcher does not need savedInstanceState to be discarded.
      //  - ReactActivityDelegateWrapper routes the call through DevLauncherController.
      //  - DevLauncherController can then manage the launch before React context starts.
      const patched = original.replace(/\bsuper\.onCreate\(null\)/g, 'super.onCreate(savedInstanceState)');

      if (patched !== original) {
        fs.writeFileSync(mainActivityPath, patched);
        console.log(
          '[withDevClientMainActivity] Patched MainActivity.kt:',
          'super.onCreate(null) → super.onCreate(savedInstanceState)'
        );
      } else {
        console.log('[withDevClientMainActivity] super.onCreate(null) not present; no patch needed.');
      }

      return config;
    },
  ]);
};

module.exports = withDevClientMainActivity;
