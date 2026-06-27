import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import NetInfo from "@react-native-community/netinfo";
import {
  initiateSubmission,
  createUploadSession,
  getUploadSession,
  completeUploadSession,
  refreshUploadSessionUrls,
  markUploadComplete,
  markUploadFailed,
  abortUploadSession,
  refreshTokens,
  setAuthTokenGetter,
} from "@workspace/api-client-react";
import type { LocalDraft } from "./drafts";
import { saveDraft, getDraft, deleteDraft } from "./drafts";
import {
  applyTransition,
  type UploadEvent,
  type CompletedPart,
} from "./uploadStateMachine";
import { reportError } from "./errorReporting";

const PART_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

const VALID_VIDEO_EXTS = new Set(["mp4", "mov", "m4v"]);

// ─── JWT pre-refresh ──────────────────────────────────────────────────────────

const TOKEN_KEY = "capto_access_token";
const REFRESH_KEY = "capto_refresh_token";
/** Refresh the access token if it expires within this window before uploading */
const PRE_UPLOAD_REFRESH_WINDOW_SEC = 300; // 5 minutes

function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

async function secureRead(key: string): Promise<string | null> {
  if (Platform.OS === "web") return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureWrite(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") { localStorage.setItem(key, value); return; }
  return SecureStore.setItemAsync(key, value);
}

/**
 * Proactively refresh the JWT access token if it will expire within
 * PRE_UPLOAD_REFRESH_WINDOW_SEC. Called before starting or resuming any upload
 * to avoid mid-upload 401s on long recordings.
 *
 * Errors are swallowed — the upload attempt proceeds normally, and a 401
 * mid-upload is handled via the standard retry path.
 */
async function refreshTokenBeforeUpload(): Promise<void> {
  try {
    const accessToken = await secureRead(TOKEN_KEY);
    if (!accessToken) return;
    const exp = decodeJwtExp(accessToken);
    if (!exp) return;
    const secondsUntilExpiry = exp - Date.now() / 1000;
    if (secondsUntilExpiry > PRE_UPLOAD_REFRESH_WINDOW_SEC) return;

    const refreshToken = await secureRead(REFRESH_KEY);
    if (!refreshToken) return;

    const result = await refreshTokens({ refreshToken });
    await Promise.all([
      secureWrite(TOKEN_KEY, result.accessToken),
      secureWrite(REFRESH_KEY, result.refreshToken),
    ]);
    setAuthTokenGetter(() => result.accessToken);
  } catch {
    // Best effort — upload proceeds; 401 mid-upload is handled by retry path
  }
}

// ─── Upload lock map ─────────────────────────────────────────────────────────
// Stores the AbortController + in-flight promise so repeated taps return
// the same promise (silent no-op) instead of throwing or double-uploading.

type UploadLock = {
  ctrl: AbortController;
  promise: Promise<{ submissionId: string }>;
};

const uploadLocks = new Map<string, UploadLock>();

export function isUploadActive(draftId: string): boolean {
  return uploadLocks.has(draftId);
}

export function cancelUploadById(draftId: string): void {
  uploadLocks.get(draftId)?.ctrl.abort();
  uploadLocks.delete(draftId);
}

// ─── Progress type ────────────────────────────────────────────────────────────

export interface VideoUploadProgress {
  phase: "preparing" | "uploading" | "completing" | "verifying";
  partsComplete: number;
  partsTotal: number;
  bytesUploaded: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isUrlExpiredStatus(status: number): boolean {
  return status === 403;
}

function backoffMs(attempt: number): number {
  const base = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  const jitter = base * 0.4 * (Math.random() - 0.5);
  return Math.round(base + jitter);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForOnline(signal: AbortSignal): Promise<void> {
  const state = await NetInfo.fetch();
  if (state.isConnected !== false) return;
  await new Promise<void>((resolve, reject) => {
    const unsub = NetInfo.addEventListener((s) => {
      if (s.isConnected !== false) {
        unsub();
        resolve();
      }
    });
    signal.addEventListener("abort", () => {
      unsub();
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function extractHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  const s = e["status"] ?? e["statusCode"];
  if (typeof s === "number") return s;
  const code = e["code"];
  if (typeof code === "string") {
    const n = parseInt(code, 10);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

// ─── State persistence ────────────────────────────────────────────────────────

/**
 * Non-status field update (session IDs, submissionId, etc.).
 * For status transitions, use applyTransition from uploadStateMachine.
 */
async function persistUpdate(
  draft: LocalDraft,
  update: Partial<LocalDraft>
): Promise<LocalDraft> {
  const next = { ...draft, ...update };
  await saveDraft(next);
  return next;
}

// ─── Error reporting ──────────────────────────────────────────────────────────

/**
 * Log an upload error with safe diagnostics: includes storageProfileId,
 * stage, retryCount. Excludes non-stable internal IDs (uploadSessionId).
 * Platform and appVersion are added automatically by the error reporter.
 */
async function logUploadError(
  draft: LocalDraft,
  err: unknown,
  httpStatus: number | undefined,
  stage: string
): Promise<void> {
  void reportError({
    errorType: "SUBMISSION_UPLOAD_FAILED",
    errorCode: draft.lastErrorCode,
    message: err instanceof Error ? err.message.slice(0, 300) : String(err),
    httpStatus,
    collectionType: draft.collectionType,
    metadata: {
      draftId: draft.id,
      taskId: draft.taskId,
      uploadStatus: draft.uploadStatus,
      storageProfileId: draft.storageProfileId,
      stage,
      retryCount: draft.retryCount ?? 0,
    },
  });
}

// ─── Part uploaders ───────────────────────────────────────────────────────────

async function uploadPartVirtual(
  url: string,
  fileUri: string,
  mimeType: string,
  signal: AbortSignal
): Promise<{ etag: string; bytes: number }> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  let bytes = 0;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists && "size" in info) bytes = info.size;
  } catch { /* ignore */ }

  const result = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": mimeType },
  });

  if (result.status < 200 || result.status >= 300) {
    const err = new Error(`Virtual PUT failed: HTTP ${result.status}`);
    (err as Error & { status: number }).status = result.status;
    throw err;
  }

  const etag =
    result.headers?.["etag"] ??
    result.headers?.["ETag"] ??
    `vtag-${Date.now()}`;
  return { etag, bytes };
}

async function uploadPartChunked(
  url: string,
  fileUri: string,
  partNumber: number,
  offset: number,
  chunkSize: number,
  mimeType: string,
  signal: AbortSignal
): Promise<{ etag: string; bytes: number }> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
    position: offset,
    length: chunkSize,
  });

  const chunk = base64ToUint8Array(b64);
  const response = await fetch(url, {
    method: "PUT",
    body: chunk as unknown as BodyInit,
    headers: { "Content-Type": mimeType, "Content-Length": String(chunk.byteLength) },
    signal,
  });

  if (!response.ok) {
    const err = new Error(`Part ${partNumber} upload failed: HTTP ${response.status}`);
    (err as Error & { status: number }).status = response.status;
    throw err;
  }

  const etag = response.headers.get("etag") ?? response.headers.get("ETag") ?? "";
  return { etag, bytes: chunk.byteLength };
}

// ─── Public: start/cancel ─────────────────────────────────────────────────────

/**
 * Start (or resume) a multipart video upload.
 *
 * If an upload is already in progress for this draft, returns the existing
 * promise silently — repeated taps are safe and do not double-start.
 *
 * Proactively refreshes the JWT access token if it is within 5 minutes of
 * expiry before beginning any network I/O.
 */
export async function startVideoUpload(
  initialDraft: LocalDraft,
  onProgress?: (p: VideoUploadProgress) => void,
  externalSignal?: AbortSignal
): Promise<{ submissionId: string }> {
  const draftId = initialDraft.id;

  const existing = uploadLocks.get(draftId);
  if (existing) {
    return existing.promise;
  }

  // Proactive JWT refresh before starting any network I/O
  await refreshTokenBeforeUpload();

  const ctrl = new AbortController();
  externalSignal?.addEventListener("abort", () => ctrl.abort(), { once: true });

  const promise = _runUpload(initialDraft, onProgress, ctrl.signal).finally(() => {
    uploadLocks.delete(draftId);
  });

  uploadLocks.set(draftId, { ctrl, promise });
  return promise;
}

// ─── Core upload loop ─────────────────────────────────────────────────────────

async function _runUpload(
  initial: LocalDraft,
  onProgress: ((p: VideoUploadProgress) => void) | undefined,
  signal: AbortSignal
): Promise<{ submissionId: string }> {
  // Always enter through QUEUE — validates the entry-point transition
  // (LOCAL_READY / PAUSED_APP_RESTART / FAILED_RECOVERABLE) and marks
  // the draft as queued before any network I/O begins.
  let draft = await applyTransition(initial, { type: "QUEUE" }, saveDraft);

  onProgress?.({ phase: "preparing", partsComplete: 0, partsTotal: 1, bytesUploaded: 0 });

  // ── Pre-flight validation ─────────────────────────────────────────────────
  // All failures here transition the draft out of QUEUED so it never gets
  // stuck in an in-progress state with disabled UI interactions.

  const videoUri = draft.mediaUris[0];
  if (!videoUri) {
    draft = await applyTransition(draft, { type: "FAIL_FINAL", lastErrorCode: "NO_MEDIA_URI" }, saveDraft);
    throw new Error("No video file found in draft.");
  }

  const info = await FileSystem.getInfoAsync(videoUri);
  if (!info.exists) {
    draft = await applyTransition(draft, { type: "FAIL_RECOVERABLE", lastErrorCode: "FILE_NOT_FOUND" }, saveDraft);
    void logUploadError(draft, new Error("File not found"), undefined, "preflight_file_check");
    throw new Error("Video file not found on device. Please re-record.");
  }
  const fileSize = "size" in info && info.size > 0 ? info.size : 0;
  if (fileSize === 0) {
    draft = await applyTransition(draft, { type: "FAIL_RECOVERABLE", lastErrorCode: "FILE_EMPTY" }, saveDraft);
    void logUploadError(draft, new Error("File empty"), undefined, "preflight_file_check");
    throw new Error("Video file is empty. Please re-record.");
  }

  if (draft.durationSeconds != null && draft.durationSeconds <= 0) {
    draft = await applyTransition(draft, { type: "FAIL_RECOVERABLE", lastErrorCode: "ZERO_DURATION" }, saveDraft);
    throw new Error("Video has zero duration. Please re-record.");
  }

  // MIME / extension validation
  const filename = videoUri.split("/").pop() ?? "video.mp4";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!VALID_VIDEO_EXTS.has(ext)) {
    draft = await applyTransition(draft, { type: "FAIL_RECOVERABLE", lastErrorCode: `INVALID_EXT_${ext.toUpperCase()}` }, saveDraft);
    throw new Error(
      `Unsupported file type: .${ext}. Expected an MP4 or MOV video file. Please re-record.`
    );
  }
  const mimeType = ext === "mov" ? "video/quicktime" : "video/mp4";

  // GPMF / IMU validation — uses the status persisted by tarzi-imu's stopAndEmbed,
  // which is the tarzi-imu validation API (no standalone post-capture validate function
  // is exported; validation runs at capture time and is stored on the draft).
  // draft.imuValidationStatus is the canonical field; imuMetadata is the fallback.
  if (draft.imuRequired) {
    const gpmfStatus = draft.imuValidationStatus ?? draft.imuMetadata?.imuValidationStatus;
    if (!draft.imuMetadata?.imuEmbedded) {
      draft = await applyTransition(
        draft,
        { type: "FAIL_RECOVERABLE", lastErrorCode: "GPMF_NOT_EMBEDDED" },
        saveDraft
      );
      void logUploadError(draft, new Error("IMU not embedded"), undefined, "preflight_gpmf_check");
      throw new Error("This task requires embedded motion sensor data. Please re-record.");
    }
    if (gpmfStatus !== "ok") {
      draft = await applyTransition(
        draft,
        {
          type: "FAIL_RECOVERABLE",
          lastErrorCode: `GPMF_${(gpmfStatus ?? "UNKNOWN").toUpperCase()}`,
        },
        saveDraft
      );
      void logUploadError(
        draft,
        new Error(`GPMF validation status: ${gpmfStatus}`),
        undefined,
        "preflight_gpmf_check"
      );
      throw new Error(
        "Motion sensor data (GPMF) validation failed. Please re-record to capture valid IMU telemetry."
      );
    }
  }

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  // ── Step 1: Initiate submission (idempotent via submissionId on resume) ────

  let submissionId: string;

  if (draft.submissionId) {
    submissionId = draft.submissionId;
  } else {
    try {
      const init = await initiateSubmission({
        taskId: draft.taskId,
        mediaFiles: [{ filename, fileSize, contentType: mimeType }],
        durationSeconds: draft.durationSeconds,
        captureMetadata: draft.imuMetadata as Record<string, unknown> | undefined,
      });
      submissionId = init.submissionId;
      draft = await persistUpdate(draft, { submissionId });
    } catch (err) {
      const status = extractHttpStatus(err);
      const isFinal =
        status !== undefined && status >= 400 && status < 500 && !isRetryableStatus(status);
      draft = await applyTransition(
        draft,
        isFinal
          ? { type: "FAIL_FINAL", lastErrorCode: status ? String(status) : "INITIATE_FAILED" }
          : { type: "FAIL_RECOVERABLE", lastErrorCode: status ? String(status) : "INITIATE_FAILED" },
        saveDraft
      );
      void logUploadError(draft, err, status, "initiate_submission");
      throw err;
    }
  }

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  // ── Step 2: Create or resume upload session ───────────────────────────────

  let sessionId: string;
  let isVirtual: boolean;
  let partUrls: Array<{ partNumber: number; uploadUrl: string }>;
  let totalParts: number;

  if (draft.uploadSessionId) {
    // ── Resume path: reconcile backend completed parts ──────────────────────
    try {
      const session = await getUploadSession(draft.uploadSessionId);

      if (session.status === "COMPLETED") {
        return await _markComplete(draft, submissionId, draft.completedParts ?? [], fileSize, onProgress);
      }
      if (session.status === "ABORTED" || session.status === "FAILED") {
        draft = await persistUpdate(draft, {
          uploadSessionId: undefined,
          completedParts: [],
          retryCount: 0,
        });
        return await _runUpload(draft, onProgress, signal);
      }

      sessionId = session.id;
      isVirtual = session.isVirtual;
      totalParts = isVirtual ? 1 : Math.ceil(fileSize / PART_SIZE);

      // Backend completedParts are authoritative for ETags;
      // local records provide bytes (not stored server-side).
      const backendDone = (session.completedParts ?? []) as Array<{
        partNumber: number;
        etag: string;
      }>;
      const reconciledMap = new Map<number, CompletedPart>(
        (draft.completedParts ?? []).map((p) => [p.partNumber, p])
      );
      for (const bp of backendDone) {
        const local = reconciledMap.get(bp.partNumber);
        reconciledMap.set(bp.partNumber, {
          partNumber: bp.partNumber,
          etag: bp.etag,
          bytes: local?.bytes ?? 0,
        });
      }
      const reconciledParts = Array.from(reconciledMap.values());

      draft = await applyTransition(
        draft,
        {
          type: "START_UPLOADING",
          sessionId: session.id,
          storageProfileId: (session.storageProfileId ?? draft.storageProfileId) ?? undefined,
          reconciledParts,
        },
        saveDraft
      );

      const doneSet = new Set(reconciledParts.map((p) => p.partNumber));
      const remaining = Array.from({ length: totalParts }, (_, i) => i + 1).filter(
        (n) => !doneSet.has(n)
      );

      if (remaining.length > 0) {
        const refreshed = await refreshUploadSessionUrls(draft.uploadSessionId!, {
          partNumbers: remaining,
        });
        partUrls = refreshed.parts;
      } else {
        partUrls = [];
      }
    } catch (err) {
      // If it's an AbortError, propagate immediately
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // If applyTransition threw (invalid transition), propagate
      if (err instanceof Error && err.message.startsWith("[UploadSM]")) throw err;
      // Otherwise — can't talk to session — start fresh
      draft = await persistUpdate(draft, {
        uploadSessionId: undefined,
        completedParts: [],
      });
      return await _runUpload(draft, onProgress, signal);
    }
  } else {
    // ── New session path ─────────────────────────────────────────────────────
    try {
      const session = await createUploadSession({
        idempotencyKey: `${draft.id}:${submissionId}`,
        submissionId,
        mediaType: "VIDEO",
        mimeType,
        originalFileName: filename,
        fileSize,
        partSize: PART_SIZE,
      });

      sessionId = session.id;
      isVirtual = session.isVirtual;
      totalParts = isVirtual ? 1 : Math.ceil(fileSize / PART_SIZE);

      const allPartNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
      const { parts } = await refreshUploadSessionUrls(session.id, {
        partNumbers: allPartNumbers,
      });
      partUrls = parts;

      draft = await applyTransition(
        draft,
        {
          type: "START_UPLOADING",
          sessionId: session.id,
          storageProfileId: session.storageProfileId ?? undefined,
          reconciledParts: [],
        },
        saveDraft
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (err instanceof Error && err.message.startsWith("[UploadSM]")) throw err;
      const status = extractHttpStatus(err);
      draft = await applyTransition(
        draft,
        { type: "FAIL_RECOVERABLE", lastErrorCode: status ? String(status) : "SESSION_CREATE_FAILED" },
        saveDraft
      );
      void logUploadError(draft, err, status, "create_upload_session");
      throw new Error(
        "Could not start upload. Your draft was saved — please try again."
      );
    }
  }

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  // ── Step 3: Upload parts ──────────────────────────────────────────────────

  const done = new Set((draft.completedParts ?? []).map((p) => p.partNumber));
  let bytesUploaded = (draft.completedParts ?? []).reduce((s, p) => s + p.bytes, 0);

  for (const { partNumber, uploadUrl } of partUrls) {
    if (done.has(partNumber)) continue;

    onProgress?.({
      phase: "uploading",
      partsComplete: done.size,
      partsTotal: totalParts,
      bytesUploaded,
    });

    const netState = await NetInfo.fetch();
    if (netState.isConnected === false) {
      draft = await applyTransition(draft, { type: "PAUSE_NETWORK" }, saveDraft);
      await waitForOnline(signal);
      draft = await applyTransition(draft, { type: "RESUME_FROM_NETWORK" }, saveDraft);
    }

    let attempt = 0;
    let currentUrl = uploadUrl;

    while (true) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const offset = (partNumber - 1) * PART_SIZE;
        const chunkSize = Math.min(PART_SIZE, fileSize - offset);

        const { etag, bytes: partBytes } =
          isVirtual
            ? await uploadPartVirtual(currentUrl, videoUri, mimeType, signal)
            : await uploadPartChunked(currentUrl, videoUri, partNumber, offset, chunkSize, mimeType, signal);

        draft = await applyTransition(
          draft,
          { type: "PART_COMPLETE", part: { partNumber, etag, bytes: partBytes } },
          saveDraft
        );
        done.add(partNumber);
        bytesUploaded += partBytes;
        break;
      } catch (err) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        const httpStatus = extractHttpStatus(err);

        // Network loss — apply the same retry framework as retryable HTTP errors:
        // START_RETRY → wait for connectivity → backoff jitter → BACK_TO_UPLOADING.
        // Enforces the same MAX_RETRIES cap so the upload eventually fails cleanly.
        if (!httpStatus) {
          if (attempt >= MAX_RETRIES) {
            draft = await applyTransition(
              draft,
              { type: "FAIL_FINAL", lastErrorCode: "NETWORK_ERROR", retryCount: attempt },
              saveDraft
            );
            void logUploadError(draft, err, undefined, "network_max_retries_exceeded");
            throw new Error(
              "Upload failed: connection lost after too many retries. Please check your network and try again."
            );
          }
          draft = await applyTransition(
            draft,
            { type: "START_RETRY", retryCount: attempt + 1, lastErrorCode: "NETWORK_ERROR" },
            saveDraft
          );
          await waitForOnline(signal);
          await sleep(backoffMs(attempt), signal);
          draft = await applyTransition(draft, { type: "BACK_TO_UPLOADING" }, saveDraft);
          attempt++;
          continue;
        }

        // Expired presigned URL — refresh then retry (doesn't count as a retry)
        if (isUrlExpiredStatus(httpStatus) && !isVirtual && sessionId) {
          try {
            const refreshed = await refreshUploadSessionUrls(sessionId, {
              partNumbers: [partNumber],
            });
            currentUrl = refreshed.parts[0]?.uploadUrl ?? currentUrl;
          } catch { /* ignore refresh failure, will retry normally */ }
          attempt++;
          continue;
        }

        if (isRetryableStatus(httpStatus)) {
          if (attempt >= MAX_RETRIES) {
            draft = await applyTransition(
              draft,
              { type: "FAIL_FINAL", lastErrorCode: String(httpStatus), retryCount: attempt },
              saveDraft
            );
            void logUploadError(draft, err, httpStatus, "max_retries_exceeded");
            throw new Error(
              `Upload failed after ${MAX_RETRIES} retries (HTTP ${httpStatus}). Please check your connection and try again.`
            );
          }
          draft = await applyTransition(
            draft,
            { type: "START_RETRY", retryCount: attempt + 1, lastErrorCode: String(httpStatus) },
            saveDraft
          );
          await sleep(backoffMs(attempt), signal);
          draft = await applyTransition(draft, { type: "BACK_TO_UPLOADING" }, saveDraft);
          attempt++;
          continue;
        }

        // Non-retryable 4xx
        draft = await applyTransition(
          draft,
          { type: "FAIL_RECOVERABLE", lastErrorCode: String(httpStatus) },
          saveDraft
        );
        void logUploadError(draft, err, httpStatus, "upload_part_non_retryable");
        throw new Error(
          `Upload failed (HTTP ${httpStatus}). Your draft was saved — please try again.`
        );
      }
    }
  }

  onProgress?.({ phase: "uploading", partsComplete: totalParts, partsTotal: totalParts, bytesUploaded });

  return await _markComplete(draft, submissionId, draft.completedParts ?? [], fileSize, onProgress, sessionId, isVirtual);
}

// ─── Complete upload ──────────────────────────────────────────────────────────

async function _markComplete(
  draft: LocalDraft,
  submissionId: string,
  completedParts: LocalDraft["completedParts"],
  fileSize: number,
  onProgress: ((p: VideoUploadProgress) => void) | undefined,
  sessionId?: string,
  isVirtual?: boolean
): Promise<{ submissionId: string }> {
  const totalParts = completedParts?.length ?? 1;
  const bytesUploaded = (completedParts ?? []).reduce((s, p) => s + p.bytes, 0);

  // ── Step 4: Complete upload session ───────────────────────────────────────

  draft = await applyTransition(draft, { type: "COMPLETING" }, saveDraft);
  onProgress?.({ phase: "completing", partsComplete: totalParts, partsTotal: totalParts, bytesUploaded });

  let completedMediaId: string | null | undefined;
  const sid = sessionId ?? draft.uploadSessionId;

  if (sid) {
    try {
      const parts =
        isVirtual
          ? []
          : (completedParts ?? []).map((p) => ({ partNumber: p.partNumber, etag: p.etag }));
      const result = await completeUploadSession(sid, {
        parts,
        submissionId,
        sortOrder: 0,
      });
      completedMediaId = result.mediaId;
    } catch (err) {
      const status = extractHttpStatus(err);
      draft = await applyTransition(
        draft,
        { type: "FAIL_RECOVERABLE", lastErrorCode: status ? String(status) : "COMPLETE_SESSION_FAILED" },
        saveDraft
      );
      void logUploadError(draft, err, status, "complete_upload_session");
      throw new Error(
        "Upload session completion failed. Your draft was saved — please try again."
      );
    }
  }

  // ── Step 5: Mark submission upload-complete ────────────────────────────────

  draft = await applyTransition(draft, { type: "VERIFYING" }, saveDraft);
  onProgress?.({ phase: "verifying", partsComplete: totalParts, partsTotal: totalParts, bytesUploaded });

  try {
    const uploadedMedia = completedMediaId ? [{ mediaId: completedMediaId, fileSize }] : [];
    await markUploadComplete(submissionId, { uploadedMedia });
  } catch (err) {
    const status = extractHttpStatus(err);
    draft = await applyTransition(
      draft,
      { type: "FAIL_RECOVERABLE", lastErrorCode: status ? String(status) : "VERIFY_FAILED" },
      saveDraft
    );
    void logUploadError(draft, err, status, "mark_upload_complete");
    throw new Error(
      "Failed to confirm submission with the server. Your draft was saved — please try again."
    );
  }

  await applyTransition(draft, { type: "COMPLETE", uploadedAt: new Date().toISOString() }, saveDraft);

  return { submissionId };
}

// ─── Cancel / abort ───────────────────────────────────────────────────────────

/**
 * Soft-cancel: abort the active upload and reset the draft to LOCAL_READY
 * so the user can retry without re-recording.
 * Uses the RESET transition so the state machine records the state change.
 */
export async function cancelUpload(draftId: string): Promise<void> {
  cancelUploadById(draftId);
  const draft = await getDraft(draftId);
  if (!draft) return;
  await applyTransition(draft, { type: "RESET" }, saveDraft);
}

/**
 * Hard-cancel: abort the active upload, mark the remote session/submission
 * as failed, and permanently delete the local draft + media files.
 *
 * Re-reads the latest draft state from AsyncStorage before deciding whether
 * to abort the remote session, so it is safe to call even after a successful
 * upload (where the draft is COMPLETED and the session must not be aborted).
 */
export async function abortAndDeleteDraft(draft: LocalDraft): Promise<void> {
  cancelUploadById(draft.id);

  const latest = await getDraft(draft.id);
  const current = latest ?? draft;
  const actualStatus = current.uploadStatus;

  if (actualStatus !== "COMPLETED") {
    // Transition to CANCELLED (state machine records the hard-cancel)
    try {
      await applyTransition(current, { type: "CANCEL" }, saveDraft);
    } catch {
      // If the transition isn't valid from this state (e.g., already FAILED_FINAL),
      // the draft will be deleted anyway — ignore the state-machine error.
    }

    const sessionId = current.uploadSessionId;
    if (sessionId) {
      abortUploadSession(sessionId).catch(() => {});
    }

    const submissionId = current.submissionId;
    if (submissionId) {
      markUploadFailed(submissionId, {
        failureReason: "User deleted draft",
      }).catch(() => {});
    }
  }

  await deleteDraft(draft.id);
}

// ─── Pre-recording storage check ─────────────────────────────────────────────

/**
 * Returns true if the device has enough free disk space to record
 * `maxDurationSeconds` at `bitrateMbps` Mbps, with a 1.2× safety margin.
 *
 * @param maxDurationSeconds  Task's maximum recording duration in seconds.
 * @param bitrateMbps         Expected bitrate in Megabits-per-second.
 *                            Default 40 Mbps covers typical 4K video.
 */
export async function hasEnoughStorage(
  maxDurationSeconds: number,
  bitrateMbps = 40
): Promise<boolean> {
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    const estimatedBytes = (maxDurationSeconds * bitrateMbps * 1_000_000) / 8;
    const required = estimatedBytes * 1.2;
    return free >= required;
  } catch {
    return true;
  }
}
