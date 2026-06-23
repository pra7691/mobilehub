const { withDangerousMod, withAndroidManifest } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Permissions that must never appear in the final Android AAB.
 * Tarzi captures photos/videos only through the in-app camera and does not
 * allow gallery selection, so media-read and storage permissions are not
 * needed and would be flagged during Play Store review.
 *
 * Two removal strategies run together:
 *
 * 1. withAndroidManifest — adds  tools:node="remove"  entries so Gradle's
 *    manifest merger blocks these permissions even when a library re-injects
 *    them after prebuild mods have run.
 *
 * 2. withDangerousMod — directly rewrites the source AndroidManifest.xml and
 *    gradle-wrapper.properties on disk.  Dangerous mods fire last in the
 *    Expo pipeline (outermost composition), so changes here are the final word.
 */

const PERMISSIONS_TO_BLOCK = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

// ── Strategy 1: tools:node="remove" via structured mod ──────────────────────

const withPermissionsRemoveDirective = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure tools namespace is present
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Remove any existing plain entries for blocked permissions
    if (manifest['uses-permission']) {
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (entry) => !PERMISSIONS_TO_BLOCK.includes(entry.$?.['android:name'])
      );
    } else {
      manifest['uses-permission'] = [];
    }

    // Add tools:node="remove" — Gradle merger will honour these even if a
    // library manifest adds the permission later in the merge chain
    for (const perm of PERMISSIONS_TO_BLOCK) {
      manifest['uses-permission'].push({
        $: {
          'android:name': perm,
          'tools:node': 'remove',
        },
      });
    }

    console.log(
      `[withPermissionsRemoveDirective] Added tools:node="remove" for ${PERMISSIONS_TO_BLOCK.length} permissions`
    );
    return config;
  });
};

// ── Strategy 2: direct file rewrite (withDangerousMod, runs last) ────────────

const stripPermissionsFromFile = (manifestPath) => {
  if (!fs.existsSync(manifestPath)) {
    console.warn('[withGradleNetworkTimeout] AndroidManifest.xml not found:', manifestPath);
    return;
  }

  let contents = fs.readFileSync(manifestPath, 'utf8');
  let removed = 0;

  for (const perm of PERMISSIONS_TO_BLOCK) {
    const escaped = perm.replace(/\./g, '\\.');
    // Remove lines that declare this permission WITHOUT tools:node (keep the remove directives)
    const pattern = new RegExp(
      `[ \t]*<uses-permission android:name="${escaped}"\\s*/>[\\r\\n]?`,
      'g'
    );
    const after = contents.replace(pattern, '');
    if (after !== contents) {
      removed++;
      console.log(`[withGradleNetworkTimeout] Stripped permission: ${perm}`);
    }
    contents = after;
  }

  fs.writeFileSync(manifestPath, contents);
  if (removed > 0) {
    console.log(`[withGradleNetworkTimeout] Manifest: stripped ${removed} plain permission entries`);
  }
};

// ── Main combined plugin ─────────────────────────────────────────────────────

const withGradleNetworkTimeout = (config) => {
  // Apply the structured tools:node="remove" mod first
  config = withPermissionsRemoveDirective(config);

  // Then apply the dangerous mod (runs last — outermost in composition chain)
  return withDangerousMod(config, [
    'android',
    (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;

      // 1. Set Gradle wrapper network timeout
      const gradleWrapperPropertiesPath = path.join(
        platformRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties'
      );

      if (!fs.existsSync(gradleWrapperPropertiesPath)) {
        console.warn(
          '[withGradleNetworkTimeout] gradle-wrapper.properties not found at:',
          gradleWrapperPropertiesPath
        );
      } else {
        let contents = fs.readFileSync(gradleWrapperPropertiesPath, 'utf8');
        if (contents.includes('networkTimeout=')) {
          contents = contents.replace(/^networkTimeout=\d+$/m, 'networkTimeout=60000');
        } else {
          contents = contents.trimEnd() + '\nnetworkTimeout=60000\n';
        }
        fs.writeFileSync(gradleWrapperPropertiesPath, contents);
        console.log('[withGradleNetworkTimeout] Set networkTimeout=60000 in gradle-wrapper.properties');
      }

      // 2. Strip blocked permissions from the main source manifest
      const manifestPath = path.join(
        platformRoot,
        'app',
        'src',
        'main',
        'AndroidManifest.xml'
      );
      stripPermissionsFromFile(manifestPath);

      return config;
    },
  ]);
};

module.exports = withGradleNetworkTimeout;
