const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Expo config plugin for the tarzi-imu native module.
 *
 * Standard accelerometer and gyroscope sensors on Android do NOT require
 * any special manifest permission — they are accessible without any
 * uses-permission declaration. Only HIGH_SAMPLING_RATE_SENSORS (API 31+,
 * needed above 200 Hz) or BODY_SENSORS (body-worn heart-rate sensors) would
 * require explicit declarations, and neither applies here.
 *
 * This plugin is a placeholder that can be extended if Expo prebuild needs
 * any Android-specific customisation for the tarzi-imu module in the future.
 */
const withTarziImu = (config) => {
  return withAndroidManifest(config, (cfg) => cfg);
};

module.exports = withTarziImu;
