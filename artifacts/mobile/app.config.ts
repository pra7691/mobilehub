import type { ConfigContext, ExpoConfig } from "expo/config";

// Switch between production and development variants via APP_VARIANT env var.
// Production (default): owner=primeaid, package=com.verbosetechlabs.tarzi
// Development:          owner=verbosetech, package=com.verbosetechlabs.tarzi.dev
//
// Usage:
//   APP_VARIANT=development eas build --profile development
//   eas build --profile production                         (APP_VARIANT unset = production)

const IS_DEV = process.env.APP_VARIANT === "development";

export default (_ctx: ConfigContext): ExpoConfig => ({
  name: IS_DEV ? "Tarzi Dev" : "Tarzi",
  slug: "tarzi",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: IS_DEV ? "tarzi-dev" : "tarzi",
  userInterfaceStyle: "dark",
  newArchEnabled: true,

  splash: {
    image: "./assets/images/icon.png",
    resizeMode: "contain",
    backgroundColor: "#0a0a0a",
  },

  ios: {
    supportsTablet: false,
    bundleIdentifier: IS_DEV
      ? "com.verbosetechlabs.tarzi.dev"
      : "com.verbosetechlabs.tarzi",
    infoPlist: {
      NSCameraUsageDescription:
        "Tarzi needs camera access to capture photo and video evidence for tasks.",
      NSMicrophoneUsageDescription:
        "Tarzi needs microphone access to record audio evidence and video with sound for tasks.",
      NSMotionUsageDescription:
        "Tarzi uses the accelerometer and gyroscope to embed sensor telemetry (IMU) into recorded video for task verification.",
    },
  },

  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/icon.png",
      backgroundColor: "#0a0a0a",
    },
    package: IS_DEV ? "com.verbosetechlabs.tarzi.dev" : "com.verbosetechlabs.tarzi",
    versionCode: 7,
    permissions: [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.INTERNET",
      "android.permission.MODIFY_AUDIO_SETTINGS",
    ],
  },

  web: {
    favicon: "./assets/images/icon.png",
  },

  plugins: [
    "./plugins/withGradleNetworkTimeout",
    "./plugins/withTarziImu",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0a0a0a",
        image: "./assets/images/icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        dark: { backgroundColor: "#0a0a0a" },
      },
    ],
    // Dev builds only: patch expo-splash-screen's super.onCreate(null) call so
    // expo-dev-client's DevLauncherController can intercept onCreate correctly.
    // Must be declared AFTER expo-splash-screen so this withMainActivity callback
    // runs after expo-splash-screen has already injected SplashScreenManager and
    // written super.onCreate(null).
    ...(IS_DEV ? ["./plugins/withDevClientMainActivity"] : []),
    // Dev builds only: pre-warm the GMS Code Scanner module at Application.onCreate()
    // so the expo-dev-client "Scan QR Code" button works on first tap after a fresh install.
    // Without this, GmsBarcodeScanning.startScan() throws MlKitException.UNAVAILABLE
    // ("Unable to start the scanner") because the GMS dynamic module hasn't downloaded yet.
    ...(IS_DEV ? ["./plugins/withMlKitPrewarm"] : []),
    [
      "expo-router",
      { origin: "https://mobile-data-hub.replit.app" },
    ],
    "expo-font",
    "expo-web-browser",
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#06b6d4",
        androidMode: "default",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Tarzi needs camera access to capture photo and video evidence for tasks.",
        microphonePermission:
          "Tarzi needs microphone access to record video with sound for tasks.",
        recordAudioAndroid: true,
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission:
          "Tarzi needs microphone access to record audio evidence for tasks.",
      },
    ],
  ] as ExpoConfig["plugins"],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    baseUrl: "/mobile",
  },

  extra: {
    eas: {
      // Development: verbosetech project (7de0a784). Production: primeaid project (85cd9282). Never swap these.
      projectId: IS_DEV
        ? "7de0a784-0329-44f7-9569-34ffb768733b"
        : "85cd9282-6693-4098-b2f7-ede669317a8d",
    },
  },

  owner: IS_DEV ? "verbosetech" : "primeaid",
});
