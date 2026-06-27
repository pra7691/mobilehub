import { requireNativeModule } from "expo-modules-core";
import type {
  SensorAvailability,
  StopAndEmbedResult,
} from "./TarziImuModule.types";

// The native module is registered under the name "TarziImu" on both platforms.
// On web / Expo Go it is unavailable; callers should guard with isAvailable().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _native: any = null;

function getNative(): NonNullable<typeof _native> {
  if (_native !== null) return _native;
  try {
    _native = requireNativeModule("TarziImu");
  } catch {
    _native = undefined;
  }
  return _native;
}

/**
 * Returns true when the native module is loaded (i.e. running in an EAS
 * build — not Expo Go or web).
 */
export function isAvailable(): boolean {
  return getNative() != null;
}

/**
 * Check whether the device has the required sensors.
 */
export async function checkSensorAvailability(): Promise<SensorAvailability> {
  const native = getNative();
  if (!native) {
    return { accelerometer: false, gyroscope: false };
  }
  return native.checkSensorAvailability() as Promise<SensorAvailability>;
}

/**
 * Begin capturing accelerometer and gyroscope samples at ~100 Hz.
 * Call this before (or at the same time as) starting video recording.
 */
export async function startCapture(): Promise<void> {
  const native = getNative();
  if (!native) {
    console.warn("[TarziImu] Native module unavailable — IMU capture skipped");
    return;
  }
  return native.startCapture() as Promise<void>;
}

/**
 * Stop capturing, build the GPMF binary payload, mux it into the MP4 at
 * `videoUri`, and return the final URI plus structured metadata.
 *
 * @param videoUri  file:// URI of the recorded MP4 segment.
 */
export async function stopAndEmbed(
  videoUri: string
): Promise<StopAndEmbedResult> {
  const native = getNative();
  if (!native) {
    return {
      uri: videoUri,
      metadata: {
        imuEmbedded: false,
        imuFormat: "none",
        accelerometerSampleCount: 0,
        gyroscopeSampleCount: 0,
        accelerometerEffectiveHz: 0,
        gyroscopeEffectiveHz: 0,
        imuValidationStatus: "native_module_unavailable",
      },
    };
  }
  return native.stopAndEmbed(videoUri) as Promise<StopAndEmbedResult>;
}
