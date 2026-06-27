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

  // Video file is present. Resolve IMU status.
  if (!draft.imuRequired) {
    // IMU not required — video is uploadable as-is.
    return { ...draft, uploadStatus: "LOCAL_READY", imuProcessingStatus: "done" };
  }

  // IMU is required. Check if it was already successfully embedded.
  const imuAlreadyEmbedded =
    draft.imuMetadata?.imuEmbedded === true &&
    draft.imuMetadata.imuValidationStatus === "ok";

  if (imuAlreadyEmbedded) {
    return { ...draft, uploadStatus: "LOCAL_READY", imuProcessingStatus: "done" };
  }

  // IMU not embedded. Check if the temp file is available for re-muxing.
  if (draft.imuTempFilePath) {
    try {
      const info = await FileSystem.getInfoAsync(draft.imuTempFilePath);
      if (info.exists && "size" in info && (info as { size: number }).size > 0) {
        // IMU temp file is present — transition to PROCESSING_IMU so the
        // EAS native build can resume muxing on the next launch.
        return {
          ...draft,
          uploadStatus: "PROCESSING_IMU",
          imuProcessingStatus: "pending",
        };
      }
    } catch {
      // Fall through to FAILED_RECOVERABLE
    }
  }

  // IMU required but neither embedded data nor temp file available.
  return {
    ...draft,
    uploadStatus: "FAILED_RECOVERABLE",
    lastErrorCode: "RECORDING_INTERRUPTED_IMU_MISSING",
    imuProcessingStatus: "failed",
  };
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

  // If IMU is not actually required, the existing video is uploadable without it.
  if (!draft.imuRequired) {
    return { ...draft, uploadStatus: "LOCAL_READY", imuProcessingStatus: "done" };
  }

  if (draft.imuTempFilePath) {
    try {
      const info = await FileSystem.getInfoAsync(draft.imuTempFilePath);
      if (info.exists && "size" in info && (info as { size: number }).size > 0) {
        // IMU temp file present — keep the draft in PROCESSING_IMU so the
        // native EAS build can resume muxing. Return unchanged.
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
 * RECORDING_INTERRUPTED — validates the video file and IMU status, then
 *   transitions to:
 *   - LOCAL_READY    — video exists + IMU not required, or IMU already embedded
 *   - PROCESSING_IMU — video exists + IMU required + IMU temp file present
 *                      (native EAS build will resume muxing)
 *   - FAILED_RECOVERABLE — video file lost, or IMU required but temp file gone
 *                          (user must re-record; shown with clear message)
 *
 * PROCESSING_IMU — checks for the IMU temp file needed for native re-muxing.
 *   - LOCAL_READY        — when IMU is not required (video is uploadable as-is)
 *   - Unchanged          — when IMU temp file exists (native EAS build handles it)
 *   - FAILED_RECOVERABLE — when IMU temp file is missing (user must re-record)
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
