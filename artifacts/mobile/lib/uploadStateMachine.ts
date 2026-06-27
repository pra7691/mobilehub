export type UploadStatus =
  | "RECORDING"
  | "RECORDING_INTERRUPTED"
  | "PROCESSING_IMU"
  | "LOCAL_READY"
  | "QUEUED"
  | "UPLOADING"
  | "PAUSED_NO_NETWORK"
  | "PAUSED_APP_RESTART"
  | "RETRY_WAIT"
  | "COMPLETING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED_RECOVERABLE"
  | "FAILED_FINAL"
  | "CANCELLED";

export interface CompletedPart {
  partNumber: number;
  etag: string;
  bytes: number;
}

/**
 * Minimal upload-state slice the reducer operates on.
 * `LocalDraft` satisfies this interface; kept here to avoid circular deps.
 */
export interface DraftUploadState {
  uploadStatus: UploadStatus;
  uploadSessionId?: string;
  storageProfileId?: string;
  completedParts?: CompletedPart[];
  retryCount?: number;
  lastErrorCode?: string;
  uploadedAt?: string;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export type UploadEvent =
  | { type: "QUEUE" }
  | { type: "START_UPLOADING"; sessionId: string; storageProfileId?: string; reconciledParts?: CompletedPart[] }
  | { type: "PAUSE_NETWORK" }
  | { type: "RESUME_FROM_NETWORK" }
  | { type: "START_RETRY"; retryCount: number; lastErrorCode: string }
  | { type: "BACK_TO_UPLOADING" }
  | { type: "PART_COMPLETE"; part: CompletedPart }
  | { type: "COMPLETING" }
  | { type: "VERIFYING" }
  | { type: "COMPLETE"; uploadedAt: string }
  | { type: "FAIL_RECOVERABLE"; lastErrorCode: string }
  | { type: "FAIL_FINAL"; lastErrorCode: string; retryCount?: number }
  | { type: "RESET" }   // soft-cancel: stop active upload, keep draft for retry
  | { type: "CANCEL" }; // hard-cancel: transition to CANCELLED before deletion

// ─── Transition graph ─────────────────────────────────────────────────────────

const ALLOWED: Readonly<Partial<Record<UploadStatus, ReadonlySet<UploadEvent["type"]>>>> = {
  LOCAL_READY:          new Set(["QUEUE", "CANCEL"]),
  PAUSED_APP_RESTART:   new Set(["QUEUE", "RESET", "CANCEL"]),
  FAILED_RECOVERABLE:   new Set(["QUEUE", "RESET", "CANCEL"]),
  QUEUED:               new Set(["START_UPLOADING", "FAIL_RECOVERABLE", "FAIL_FINAL", "RESET", "CANCEL"]),
  UPLOADING:            new Set(["PART_COMPLETE", "PAUSE_NETWORK", "START_RETRY", "COMPLETING", "FAIL_RECOVERABLE", "FAIL_FINAL", "RESET", "CANCEL"]),
  PAUSED_NO_NETWORK:    new Set(["RESUME_FROM_NETWORK", "RESET", "CANCEL"]),
  RETRY_WAIT:           new Set(["BACK_TO_UPLOADING", "FAIL_FINAL", "RESET", "CANCEL"]),
  COMPLETING:           new Set(["VERIFYING", "FAIL_RECOVERABLE", "RESET", "CANCEL"]),
  VERIFYING:            new Set(["COMPLETE", "FAIL_RECOVERABLE", "RESET", "CANCEL"]),
  // Terminal states: no outgoing transitions
  COMPLETED:            new Set([]),
  FAILED_FINAL:         new Set([]),
  CANCELLED:            new Set([]),
  RECORDING:            new Set([]),
  RECORDING_INTERRUPTED: new Set([]),
  PROCESSING_IMU:       new Set([]),
};

export function isTransitionAllowed(
  status: UploadStatus,
  eventType: UploadEvent["type"]
): boolean {
  return ALLOWED[status]?.has(eventType) ?? false;
}

// ─── Pure reducer ─────────────────────────────────────────────────────────────

/**
 * Pure reducer. Applies the event to the current state and returns the next
 * state. **Throws** if the transition is not permitted by the transition graph.
 * Use `applyTransition` for the persisting variant.
 */
export function reduceUpload<T extends DraftUploadState>(state: T, event: UploadEvent): T {
  if (!isTransitionAllowed(state.uploadStatus, event.type)) {
    throw new Error(
      `[UploadSM] Invalid transition: ${state.uploadStatus} → ${event.type}`
    );
  }

  switch (event.type) {
    case "QUEUE":
      return { ...state, uploadStatus: "QUEUED" };

    case "START_UPLOADING":
      return {
        ...state,
        uploadStatus: "UPLOADING",
        uploadSessionId: event.sessionId,
        storageProfileId: event.storageProfileId ?? state.storageProfileId,
        completedParts: event.reconciledParts ?? state.completedParts ?? [],
      };

    case "PAUSE_NETWORK":
      return { ...state, uploadStatus: "PAUSED_NO_NETWORK" };

    case "RESUME_FROM_NETWORK":
      return { ...state, uploadStatus: "UPLOADING" };

    case "START_RETRY":
      return {
        ...state,
        uploadStatus: "RETRY_WAIT",
        retryCount: event.retryCount,
        lastErrorCode: event.lastErrorCode,
      };

    case "BACK_TO_UPLOADING":
      return { ...state, uploadStatus: "UPLOADING" };

    case "PART_COMPLETE":
      return {
        ...state,
        completedParts: [...(state.completedParts ?? []), event.part],
      };

    case "COMPLETING":
      return { ...state, uploadStatus: "COMPLETING" };

    case "VERIFYING":
      return { ...state, uploadStatus: "VERIFYING" };

    case "COMPLETE":
      return { ...state, uploadStatus: "COMPLETED", uploadedAt: event.uploadedAt };

    case "FAIL_RECOVERABLE":
      return {
        ...state,
        uploadStatus: "FAILED_RECOVERABLE",
        lastErrorCode: event.lastErrorCode,
      };

    case "FAIL_FINAL":
      return {
        ...state,
        uploadStatus: "FAILED_FINAL",
        lastErrorCode: event.lastErrorCode,
        ...(event.retryCount !== undefined && { retryCount: event.retryCount }),
      };

    case "RESET":
      return { ...state, uploadStatus: "LOCAL_READY" };

    case "CANCEL":
      return { ...state, uploadStatus: "CANCELLED" };

    default:
      return state;
  }
}

// ─── Persisting transition ────────────────────────────────────────────────────

/**
 * Apply a validated state-machine event, persist immediately via `saveFn`,
 * and return the next state. Throws if the transition is not allowed.
 *
 * This is the canonical API for all status changes — callers supply the
 * persistence implementation to keep this module free of I/O dependencies.
 *
 * @example
 *   import { saveDraft } from "./drafts";
 *   draft = await applyTransition(draft, { type: "QUEUE" }, saveDraft);
 */
export async function applyTransition<T extends DraftUploadState>(
  draft: T,
  event: UploadEvent,
  saveFn: (next: T) => Promise<void>
): Promise<T> {
  const next = reduceUpload(draft, event);
  await saveFn(next);
  return next;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const TERMINAL_STATUSES: ReadonlySet<UploadStatus> = new Set([
  "COMPLETED",
  "FAILED_FINAL",
  "CANCELLED",
]);

export const IN_PROGRESS_STATUSES: ReadonlySet<UploadStatus> = new Set([
  "QUEUED",
  "UPLOADING",
  "PAUSED_NO_NETWORK",
  "RETRY_WAIT",
  "COMPLETING",
  "VERIFYING",
]);

export const RECOVERABLE_STATUSES: ReadonlySet<UploadStatus> = new Set([
  "PAUSED_APP_RESTART",
  "FAILED_RECOVERABLE",
]);

export function isInProgress(status: UploadStatus): boolean {
  return IN_PROGRESS_STATUSES.has(status);
}

export function isRecoverable(status: UploadStatus): boolean {
  return RECOVERABLE_STATUSES.has(status);
}

export function uploadStatusLabel(status: UploadStatus): string {
  switch (status) {
    case "RECORDING":             return "Recording";
    case "RECORDING_INTERRUPTED": return "Interrupted";
    case "PROCESSING_IMU":        return "Processing IMU";
    case "LOCAL_READY":           return "Ready to Upload";
    case "QUEUED":                return "Queued";
    case "UPLOADING":             return "Uploading";
    case "PAUSED_NO_NETWORK":     return "No Network";
    case "PAUSED_APP_RESTART":    return "Paused";
    case "RETRY_WAIT":            return "Retrying";
    case "COMPLETING":            return "Finishing";
    case "VERIFYING":             return "Verifying";
    case "COMPLETED":             return "Submitted";
    case "FAILED_RECOVERABLE":    return "Upload Needs Attention";
    case "FAILED_FINAL":          return "Upload Failed";
    case "CANCELLED":             return "Cancelled";
  }
}
