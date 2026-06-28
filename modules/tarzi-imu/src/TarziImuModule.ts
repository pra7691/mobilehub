import { requireNativeModule } from "expo-modules-core";
import type {
  SensorAvailability,
  StopAndEmbedResult,
} from "./TarziImuModule.types";

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
 * Returns true when the native module is loaded (EAS build — not Expo Go or web).
 */
export function isAvailable(): boolean {
  return getNative() != null;
}

/**
 * Returns the list of method/property names exposed by the native TarziImu module.
 * Returns an empty array when the module is not loaded.
 * Used for diagnostic logging only — do not use in production logic.
 */
export function getNativeMethodNames(): string[] {
  const native = getNative();
  if (!native) return [];
  try {
    return Object.keys(native as object);
  } catch {
    return [];
  }
}

/**
 * Check whether the device has the required sensors.
 */
export async function checkSensorAvailability(): Promise<SensorAvailability> {
  const native = getNative();
  if (!native) return { accelerometer: false, gyroscope: false };
  return native.checkSensorAvailability() as Promise<SensorAvailability>;
}

/**
 * Begin capturing accelerometer + gyroscope samples at ~100 Hz.
 *
 * @param imuTempFilePath  Optional path for incremental TIMU disk streaming.
 *   When provided, every sample is appended to a binary TIMU file so data
 *   survives a process kill. Use ensureImuDir() from drafts.ts to obtain a
 *   safe directory. Pass null to keep samples in memory only (no persistence).
 * @param taskId  Diagnostic identifier only — not embedded in the TIMU file.
 */
export async function startCapture(
  imuTempFilePath?: string | null,
  taskId?: string | null
): Promise<void> {
  const native = getNative();
  if (!native) {
    console.warn("[TarziImu] Native module unavailable — IMU capture skipped");
    return;
  }
  return native.startCapture(
    imuTempFilePath ?? null,
    taskId ?? null
  ) as Promise<void>;
}

/**
 * Stop capturing, build time-aligned GPMF chunks (~1 s each), mux them into
 * the MP4 at `videoUri`, validate, and return the final URI + metadata.
 *
 * imuEmbedded is set to true only when GPMF validation passes (gpmd track
 * exists, ≥ 2 timed samples, ACCL + GYRO present, ≥ 95 % temporal coverage).
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

/**
 * Resume GPMF embedding after an app restart for a PROCESSING_IMU draft.
 *
 * Reads the persisted TIMU binary file, reconstructs sensor samples, and
 * muxes them into a new MP4 at `outputUri`. Neither `rawVideoUri` nor
 * `imuTempFilePath` are modified — the caller must delete them only after
 * confirming imuEmbedded === true in the returned metadata.
 *
 * Throws with code ERR_IMU_FILE when the TIMU file is missing, corrupt,
 * or contains an unknown version byte. Throws ERR_EMBED on mux failure.
 *
 * @param rawVideoUri      file:// URI of the unmodified source MP4.
 * @param imuTempFilePath  Full path to the TIMU binary file created by startCapture.
 * @param outputUri        file:// URI where the GPMF-embedded MP4 will be written.
 */
export async function resumeEmbed(
  rawVideoUri: string,
  imuTempFilePath: string,
  outputUri: string
): Promise<StopAndEmbedResult> {
  const native = getNative();
  if (!native) {
    return {
      uri: rawVideoUri,
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
  return native.resumeEmbed(
    rawVideoUri,
    imuTempFilePath,
    outputUri
  ) as Promise<StopAndEmbedResult>;
}
