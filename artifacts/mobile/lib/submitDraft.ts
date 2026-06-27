import {
  markUploadFailed,
} from "@workspace/api-client-react";
import type { LocalDraft } from "./drafts";
import { type VideoUploadProgress, startVideoUpload, startAudioUpload, startImageUpload } from "./uploadClient";
import { uploadWithFallback } from "./backgroundUploadManager";

export type SubmitPhase = "preparing" | "uploading" | "submitting";

export interface SubmitProgress {
  phase: SubmitPhase;
  current: number;
  total: number;
}

/**
 * Submit a draft for review.
 *
 * All three collection types now route through state-machine upload clients that
 * support deduplication, state persistence, retries, and abort signals.
 *
 * VIDEO  → uploadWithFallback (backgroundUploadManager → multipart state machine)
 * AUDIO  → startAudioUpload   (lock + state machine + per-file retry)
 * IMAGE  → startImageUpload   (lock + state machine + per-file retry)
 */
export async function submitDraft(
  draft: LocalDraft,
  onProgress?: (progress: SubmitProgress) => void,
  signal?: AbortSignal
): Promise<{ submissionId: string }> {
  if (draft.collectionType === "VIDEO") {
    return _submitVideoDraft(draft, onProgress, signal);
  }
  if (draft.collectionType === "AUDIO") {
    return _submitAudioDraft(draft, onProgress, signal);
  }
  return _submitImageDraft(draft, onProgress, signal);
}

// ── Progress bridge ────────────────────────────────────────────────────────────

function _bridgeProgress(
  p: VideoUploadProgress,
  onProgress: ((p: SubmitProgress) => void) | undefined
): void {
  if (!onProgress) return;
  const phase: SubmitPhase =
    p.phase === "preparing"
      ? "preparing"
      : p.phase === "verifying" || p.phase === "completing"
        ? "submitting"
        : "uploading";
  onProgress({ phase, current: p.partsComplete, total: Math.max(p.partsTotal, 1) });
}

// ── VIDEO ──────────────────────────────────────────────────────────────────────

async function _submitVideoDraft(
  draft: LocalDraft,
  onProgress?: (progress: SubmitProgress) => void,
  signal?: AbortSignal
): Promise<{ submissionId: string }> {
  if (
    draft.imuRequired &&
    (!draft.imuMetadata ||
      !draft.imuMetadata.imuEmbedded ||
      draft.imuMetadata.imuValidationStatus !== "ok")
  ) {
    throw new Error(
      "This task requires motion sensor data (IMU) to be captured. Please retake the video."
    );
  }

  return uploadWithFallback(
    draft,
    (p) => _bridgeProgress(p, onProgress),
    signal
  );
}

// ── AUDIO ──────────────────────────────────────────────────────────────────────

async function _submitAudioDraft(
  draft: LocalDraft,
  onProgress?: (progress: SubmitProgress) => void,
  signal?: AbortSignal
): Promise<{ submissionId: string }> {
  return startAudioUpload(
    draft,
    (p) => _bridgeProgress(p, onProgress),
    signal
  );
}

// ── IMAGE ──────────────────────────────────────────────────────────────────────

async function _submitImageDraft(
  draft: LocalDraft,
  onProgress?: (progress: SubmitProgress) => void,
  signal?: AbortSignal
): Promise<{ submissionId: string }> {
  if (signal?.aborted) {
    await markUploadFailed(draft.submissionId ?? "unknown", {
      failureReason: "Upload cancelled by user",
    }).catch(() => {});
    throw new Error("Upload cancelled");
  }

  return startImageUpload(
    draft,
    (p) => _bridgeProgress(p, onProgress),
    signal
  );
}
