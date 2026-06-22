const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that sets networkTimeout=60000 in
 * android/gradle/wrapper/gradle-wrapper.properties after prebuild generates
 * the native Android project.
 *
 * This prevents the Gradle Wrapper from timing out when downloading the
 * Gradle distribution ZIP during EAS Build (default timeout is 10000ms).
 *
 * Using a config plugin (rather than committing the android/ directory) ensures
 * the setting is re-applied every time EAS runs `expo prebuild`, even if the
 * native files are regenerated from scratch.
 */
const withGradleNetworkTimeout = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const gradleWrapperPropertiesPath = path.join(
        config.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties'
      );

      if (!fs.existsSync(gradleWrapperPropertiesPath)) {
        console.warn(
          '[withGradleNetworkTimeout] gradle-wrapper.properties not found at:',
          gradleWrapperPropertiesPath
        );
        return config;
      }

      let contents = fs.readFileSync(gradleWrapperPropertiesPath, 'utf8');

      if (contents.includes('networkTimeout=')) {
        contents = contents.replace(/^networkTimeout=\d+$/m, 'networkTimeout=60000');
      } else {
        contents = contents.trimEnd() + '\nnetworkTimeout=60000\n';
      }

      fs.writeFileSync(gradleWrapperPropertiesPath, contents);
      console.log('[withGradleNetworkTimeout] Set networkTimeout=60000 in gradle-wrapper.properties');

      return config;
    },
  ]);
};

module.exports = withGradleNetworkTimeout;
