import * as FileSystem from "expo-file-system/legacy";

import {
  isAvailable as imuIsAvailable,
  resumeEmbed as imuResumeEmbed,
} from "@workspace/tarzi-imu";
import {
  listDrafts,
  saveDraft,
  DRAFTS_DIR,
  type LocalDraft,
} from "./drafts";
import { reportError } from "./errorReporting";
import type { ImuCaptureSummary } from "./captureStore";

// ─── RECORDING_INTERRUPTED recovery ──────────────────────────────────────────

async function recoverRecordingInterrupted(draft: LocalDraft): Promise<LocalDraft> {
  const videoUri = draft.mediaUris[0];
  if (!videoUri) {
    return {
      ...draft,
      uploadStatus: "FAILED_RECOVERABLE",
      lastErrorCode: "NO_MEDIA_URI",
      imuProcessingStatus: "failed",
    };
  }

  let fileExists = false;
  try {
    const info = await FileSystem.getInfoAsync(videoUri);
    fileExists = info.exists;
  } catch {
    fileExists = false;
  }

  if (!fileExists) {
    return {
      ...draft,
      uploadStatus: "FAILED_RECOVERABLE",
      lastErrorCode: "RECORDING_INTERRUPTED_FILE_LOST",
      imuProcessingStatus: "failed",
    };
  }

  if (!draft.imuRequired) {
    return { ...draft, uploadStatus: "LOCAL_READY", imuProcessingStatus: "done" };
  }

  const imuAlreadyEmbedded =
    draft.imuMetadata?.imuEmbedded === true &&
    draft.imuMetadata.imuValidationStatus === "ok";

  if (imuAlreadyEmbedded) {
    return { ...draft, uploadStatus: "LOCAL_READY", imuProcessingStatus: "done" };
  }

  if (draft.imuTempFilePath) {
    try {
      const info = await FileSystem.getInfoAsync(draft.imuTempFilePath);
      if (info.exists && "size" in info && (info as { size: number }).size > 13) {
        return {
          ...draft,
          uploadStatus: "PROCESSING_IMU",
          imuProcessingStatus: "pending",
        };
      }
    } catch {
      // fall through to FAILED_RECOVERABLE
    }
  }

  return {
    ...draft,
    uploadStatus: "FAILED_RECOVERABLE",
    lastErrorCode: "RECORDING_INTERRUPTED_IMU_MISSING",
    imuProcessingStatus: "failed",
  };
}

// ─── PROCESSING_IMU recovery ──────────────────────────────────────────────────

async function recoverProcessingImu(draft: LocalDraft): Promise<LocalDraft> {
  if (!draft.imuRequired) {
    return { ...draft, uploadStatus: "LOCAL_READY", imuProcessingStatus: "done" };
  }

  // Native module available — attempt re-mux from the persisted TIMU file
  if (imuIsAvailable()) {
    const rawVideoUri     = draft.rawVideoUri ?? draft.mediaUris[0];
    const imuTempFilePath = draft.imuTempFilePath;

    if (!rawVideoUri || !imuTempFilePath) {
      return {
        ...draft,
        uploadStatus: "FAILED_RECOVERABLE",
        lastErrorCode: "PROCESSING_IMU_MISSING_FILES",
        imuProcessingStatus: "failed",
      };
    }

    const [videoInfo, imuInfo] = await Promise.all([
      FileSystem.getInfoAsync(rawVideoUri).catch(() => ({ exists: false } as FileSystem.FileInfo)),
      FileSystem.getInfoAsync(imuTempFilePath).catch(() => ({ exists: false } as FileSystem.FileInfo)),
    ]);

    if (!videoInfo.exists) {
      return {
        ...draft,
        uploadStatus: "FAILED_RECOVERABLE",
        lastErrorCode: "RECORDING_INTERRUPTED_FILE_LOST",
        imuProcessingStatus: "failed",
      };
    }

    const imuSize = imuInfo.exists && "size" in imuInfo ? (imuInfo as { size: number }).size : 0;
    if (!imuInfo.exists || imuSize < 13) {
      return {
        ...draft,
        uploadStatus: "FAILED_RECOVERABLE",
        lastErrorCode: "PROCESSING_IMU_TEMP_FILE_MISSING",
        imuProcessingStatus: "failed",
      };
    }

    // Build output path in persistent documentDirectory so it survives restarts
    const outputFilename = `${draft.id}_embedded.mp4`;
    const outputUri      = `${DRAFTS_DIR}${outputFilename}`;

    try {
      const result = await imuResumeEmbed(rawVideoUri, imuTempFilePath, outputUri);

      if (!result.metadata.imuEmbedded || result.metadata.imuValidationStatus !== "ok") {
        return {
          ...draft,
          uploadStatus: "FAILED_RECOVERABLE",
          lastErrorCode: `GPMF_${result.metadata.imuValidationStatus.toUpperCase()}`,
          imuProcessingStatus: "failed",
        };
      }

      // Validation passed — clean up source and temp files
      void FileSystem.deleteAsync(rawVideoUri, { idempotent: true }).catch(() => {});
      void FileSystem.deleteAsync(imuTempFilePath, { idempotent: true }).catch(() => {});

      const imuSummary: ImuCaptureSummary = {
        imuEmbedded: true,
        imuFormat: result.metadata.imuFormat,
        imuTargetHz: 100,
        accelerometerSampleCount: result.metadata.accelerometerSampleCount,
        gyroscopeSampleCount: result.metadata.gyroscopeSampleCount,
        accelerometerEffectiveHz: result.metadata.accelerometerEffectiveHz,
        gyroscopeEffectiveHz: result.metadata.gyroscopeEffectiveHz,
        imuCaptureStartedAtRelativeMs: 0,
        imuCaptureEndedAtRelativeMs: 0,
        imuValidationStatus: "ok",
        deviceModel: "recovered",
        osVersion: "recovered",
      };

      return {
        ...draft,
        mediaUris: [outputUri],
        rawVideoUri: undefined,
        imuTempFilePath: undefined,
        imuMetadata: imuSummary,
        uploadStatus: "LOCAL_READY",
        imuProcessingStatus: "done",
      };
    } catch (err) {
      void reportError({
        errorType: "UNKNOWN",
        message: `resumeEmbed failed: ${err instanceof Error ? err.message : String(err)}`,
        metadata: { draftId: draft.id, taskId: draft.taskId },
      });
      return {
        ...draft,
        uploadStatus: "FAILED_RECOVERABLE",
        lastErrorCode: "PROCESSING_IMU_REMUX_FAILED",
        imuProcessingStatus: "failed",
      };
    }
  }

  // Native module not loaded (Expo Go / web) — keep draft if temp file exists
  if (draft.imuTempFilePath) {
    try {
      const info = await FileSystem.getInfoAsync(draft.imuTempFilePath);
      if (info.exists && "size" in info && (info as { size: number }).size > 13) {
        return draft; // unchanged — EAS native build will resume on next launch
      }
    } catch {
      // fall through
    }
  }

  return {
    ...draft,
    uploadStatus: "FAILED_RECOVERABLE",
    lastErrorCode: "PROCESSING_IMU_RECOVERY_UNAVAILABLE",
    imuProcessingStatus: "failed",
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called on every app launch (before rendering UI) to recover interrupted drafts.
 *
 * RECORDING_INTERRUPTED — validates video + IMU state, then transitions to:
 *   LOCAL_READY        — file exists + no IMU required, or IMU already embedded
 *   PROCESSING_IMU     — file exists + IMU temp file present → attempt re-mux
 *   FAILED_RECOVERABLE — file lost, or IMU required but temp file gone
 *
 * PROCESSING_IMU — when native module is loaded, calls resumeEmbed() to produce
 *   the final GPMF-embedded MP4 and transitions to LOCAL_READY on success.
 *   On Expo Go (no native module) the draft is kept in PROCESSING_IMU if the
 *   temp file is still present, or transitioned to FAILED_RECOVERABLE otherwise.
 */
export async function recoverAllRecordingDrafts(): Promise<void> {
  let drafts: LocalDraft[];
  try {
    drafts = await listDrafts();
  } catch {
    return;
  }

  const toRecover = drafts.filter(
    (d) =>
      d.uploadStatus === "RECORDING_INTERRUPTED" ||
      d.uploadStatus === "PROCESSING_IMU"
  );
  if (toRecover.length === 0) return;

  for (const draft of toRecover) {
    try {
      const recovered =
        draft.uploadStatus === "RECORDING_INTERRUPTED"
          ? await recoverRecordingInterrupted(draft)
          : await recoverProcessingImu(draft);

      if (recovered !== draft) {
        await saveDraft(recovered);
      }
    } catch (err) {
      void reportError({
        errorType: "UNKNOWN",
        message: `Recording recovery failed for draft ${draft.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        metadata: { draftId: draft.id, uploadStatus: draft.uploadStatus },
      });
    }
  }
}
