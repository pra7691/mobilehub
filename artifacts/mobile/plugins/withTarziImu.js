const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Expo config plugin for the tarzi-imu native module.
 *
 * Ensures the Android manifest declares the BODY_SENSORS permission so
 * SensorManager can access accelerometer and gyroscope data.
 *
 * NOTE: android.permission.HIGH_SAMPLING_RATE_SENSORS (API 31+) is intentionally
 * omitted — SENSOR_DELAY_GAME operates below the 200 Hz threshold that requires it.
 */
const withTarziImu = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const SENSOR_PERM = 'android.permission.BODY_SENSORS';
    const already = manifest['uses-permission'].some(
      (p) => p.$?.['android:name'] === SENSOR_PERM
    );

    if (!already) {
      manifest['uses-permission'].push({ $: { 'android:name': SENSOR_PERM } });
      console.log(`[withTarziImu] Added ${SENSOR_PERM}`);
    }

    return config;
  });
};

module.exports = withTarziImu;
