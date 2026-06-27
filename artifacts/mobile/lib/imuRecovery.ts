import * as FileSystem from "expo-file-system/legacy";

import { listDrafts, saveDraft, type LocalDraft } from "./drafts";
import { reportError } from "./errorReporting";

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

  // If IMU is required but the embedded result is missing or failed, this
  // recording cannot be submitted — user must re-record.
  if (draft.imuRequired) {
    const hasValidImu =
      draft.imuMetadata?.imuEmbedded === true &&
      draft.imuMetadata.imuValidationStatus === "ok";
    if (!hasValidImu) {
      return {
        ...draft,
        uploadStatus: "FAILED_RECOVERABLE",
        lastErrorCode: "RECORDING_INTERRUPTED_IMU_MISSING",
        imuProcessingStatus: "failed",
      };
    }
  }

  // Video file exists, IMU either not required or already valid — ready to upload.
  return { ...draft, uploadStatus: "LOCAL_READY", imuProcessingStatus: "done" };
}

// ─── PROCESSING_IMU recovery ──────────────────────────────────────────────────

async function recoverProcessingImu(draft: LocalDraft): Promise<LocalDraft> {
  // Native disk streaming (updated tarzi-imu module) is required to complete
  // GPMF muxing after an app restart. Without an EAS development build that
  // includes the native disk-streaming module, re-muxing cannot be performed.
  //
  // TODO (EAS build): When the native disk-streaming module is available:
  //   1. Call imuIsAvailable() to confirm the native module is loaded.
  //   2. Check that draft.rawVideoUri and draft.imuTempFilePath both exist.
  //   3. Call tarziImuResumeEmbed(draft.rawVideoUri!, draft.imuTempFilePath!)
  //      to produce the GPMF-embedded file.
  //   4. Call moveMediaToDrafts(result.uri, filename) to persist atomically.
  //   5. Update draft.mediaUris with the new URI and transition to LOCAL_READY.

  if (draft.imuTempFilePath) {
    try {
      const info = await FileSystem.getInfoAsync(draft.imuTempFilePath);
      if (info.exists && "size" in info && (info as { size: number }).size > 0) {
        // IMU temp file present — keep the draft in PROCESSING_IMU so the
        // native build can resume muxing. Return unchanged.
        return draft;
      }
    } catch {
      // Fall through to FAILED_RECOVERABLE
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
 * Called on every app launch (before rendering UI) to recover drafts that were
 * interrupted during video recording or IMU processing.
 *
 * RECORDING_INTERRUPTED — validates the video file and IMU data, then
 *   transitions to LOCAL_READY (safe to upload) or FAILED_RECOVERABLE
 *   (user must re-record; shown with "Recording was interrupted" message).
 *
 * PROCESSING_IMU — checks for the IMU temp file needed for native re-muxing.
 *   Kept in PROCESSING_IMU when the file exists (for future native build);
 *   transitioned to FAILED_RECOVERABLE when the file is gone or unavailable.
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
