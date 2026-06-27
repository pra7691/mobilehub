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
} from "@workspace/api-client-react";
import type { LocalDraft } from "./drafts";
import { saveDraft, getDraft, deleteDraft } from "./drafts";
import type { UploadStatus } from "./uploadStateMachine";
import { reportError } from "./errorReporting";

const PART_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

const uploadLocks = new Map<string, AbortController>();

export function isUploadActive(draftId: string): boolean {
  return uploadLocks.has(draftId);
}

export function cancelUploadById(draftId: string): void {
  uploadLocks.get(draftId)?.abort();
  uploadLocks.delete(draftId);
}

export interface VideoUploadProgress {
  phase: "preparing" | "uploading" | "completing" | "verifying";
  partsComplete: number;
  partsTotal: number;
  bytesUploaded: number;
}

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

async function persistUpdate(
  draft: LocalDraft,
  update: Partial<LocalDraft>
): Promise<LocalDraft> {
  const next = { ...draft, ...update };
  await saveDraft(next);
  return next;
}

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

async function logUploadError(
  draft: LocalDraft,
  err: unknown,
  httpStatus: number | undefined,
  stage: string
): Promise<void> {
  void reportError({
    errorType: "SUBMISSION_UPLOAD_FAILED",
    message: err instanceof Error ? err.message.slice(0, 300) : String(err),
    httpStatus,
    collectionType: draft.collectionType,
    metadata: {
      draftId: draft.id,
      taskId: draft.taskId,
      uploadStatus: draft.uploadStatus,
      uploadSessionId: draft.uploadSessionId,
      stage,
      retryCount: draft.retryCount ?? 0,
      lastErrorCode: draft.lastErrorCode,
    },
  });
}

export async function startVideoUpload(
  initialDraft: LocalDraft,
  onProgress?: (p: VideoUploadProgress) => void,
  externalSignal?: AbortSignal
): Promise<{ submissionId: string }> {
  const draftId = initialDraft.id;

  if (uploadLocks.has(draftId)) {
    throw new Error("Upload already in progress for this draft.");
  }

  const controller = new AbortController();
  uploadLocks.set(draftId, controller);
  externalSignal?.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    return await _runUpload(initialDraft, onProgress, controller.signal);
  } finally {
    uploadLocks.delete(draftId);
  }
}

async function _runUpload(
  initial: LocalDraft,
  onProgress: ((p: VideoUploadProgress) => void) | undefined,
  signal: AbortSignal
): Promise<{ submissionId: string }> {
  let draft = initial;

  onProgress?.({ phase: "preparing", partsComplete: 0, partsTotal: 1, bytesUploaded: 0 });

  const videoUri = draft.mediaUris[0];
  if (!videoUri) throw new Error("No video file found in draft.");

  const info = await FileSystem.getInfoAsync(videoUri);
  if (!info.exists) {
    throw new Error("Video file not found on device. Please re-record.");
  }
  const fileSize = "size" in info && info.size > 0 ? info.size : 0;
  if (fileSize === 0) throw new Error("Video file is empty. Please re-record.");

  if (draft.durationSeconds != null && draft.durationSeconds <= 0) {
    throw new Error("Video has zero duration. Please re-record.");
  }

  if (
    draft.imuRequired &&
    (!draft.imuMetadata?.imuEmbedded || draft.imuMetadata?.imuValidationStatus !== "ok")
  ) {
    throw new Error(
      "This task requires valid motion sensor data (IMU). Please re-record."
    );
  }

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const filename = videoUri.split("/").pop() ?? "video.mp4";
  const mimeType = filename.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";

  // ── Step 1: Initiate submission (idempotent via submissionId on resume) ──────
  let submissionId: string;

  if (draft.submissionId) {
    submissionId = draft.submissionId;
  } else {
    draft = await persistUpdate(draft, { uploadStatus: "QUEUED" });
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
      const nextStatus: UploadStatus =
        status !== undefined && status >= 400 && status < 500 && !isRetryableStatus(status)
          ? "FAILED_FINAL"
          : "FAILED_RECOVERABLE";
      draft = await persistUpdate(draft, {
        uploadStatus: nextStatus,
        lastErrorCode: status ? String(status) : "INITIATE_FAILED",
      });
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
    try {
      const session = await getUploadSession(draft.uploadSessionId);

      if (session.status === "COMPLETED") {
        // Already completed remotely — jump to mark-complete
        return await _markComplete(draft, submissionId, [], fileSize, onProgress);
      }
      if (session.status === "ABORTED" || session.status === "FAILED") {
        // Dead session — clear and retry from scratch
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

      const done = new Set((draft.completedParts ?? []).map((p) => p.partNumber));
      const remaining = Array.from({ length: totalParts }, (_, i) => i + 1).filter(
        (n) => !done.has(n)
      );

      if (remaining.length > 0) {
        const refreshed = await refreshUploadSessionUrls(draft.uploadSessionId, {
          partNumbers: remaining,
        });
        partUrls = refreshed.parts;
      } else {
        partUrls = [];
      }
    } catch {
      // Can't talk to session — start fresh
      draft = await persistUpdate(draft, {
        uploadSessionId: undefined,
        completedParts: [],
      });
      return await _runUpload(draft, onProgress, signal);
    }
  } else {
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

      draft = await persistUpdate(draft, {
        uploadStatus: "UPLOADING",
        uploadSessionId: sessionId,
        storageProfileId: session.storageProfileId ?? undefined,
        completedParts: [],
      });
    } catch (err) {
      const status = extractHttpStatus(err);
      draft = await persistUpdate(draft, {
        uploadStatus: "FAILED_RECOVERABLE",
        lastErrorCode: status ? String(status) : "SESSION_CREATE_FAILED",
      });
      void logUploadError(draft, err, status, "create_upload_session");
      throw new Error(
        "Could not start upload. Your draft was saved — please try again."
      );
    }
  }

  draft = await persistUpdate(draft, { uploadStatus: "UPLOADING" });

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
      draft = await persistUpdate(draft, { uploadStatus: "PAUSED_NO_NETWORK" });
      await waitForOnline(signal);
      draft = await persistUpdate(draft, { uploadStatus: "UPLOADING" });
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

        const newParts = [
          ...(draft.completedParts ?? []),
          { partNumber, etag, bytes: partBytes },
        ];
        draft = await persistUpdate(draft, { completedParts: newParts });
        done.add(partNumber);
        bytesUploaded += partBytes;
        break;
      } catch (err) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        const httpStatus = extractHttpStatus(err);

        // Network loss — wait for connectivity then retry
        if (!httpStatus) {
          draft = await persistUpdate(draft, { uploadStatus: "PAUSED_NO_NETWORK" });
          await waitForOnline(signal);
          draft = await persistUpdate(draft, { uploadStatus: "UPLOADING" });
          attempt++;
          continue;
        }

        // Expired presigned URL — refresh then retry (doesn't count as retry)
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
            draft = await persistUpdate(draft, {
              uploadStatus: "FAILED_FINAL",
              lastErrorCode: String(httpStatus),
              retryCount: attempt,
            });
            void logUploadError(draft, err, httpStatus, "max_retries_exceeded");
            throw new Error(
              `Upload failed after ${MAX_RETRIES} retries (HTTP ${httpStatus}). Please check your connection and try again.`
            );
          }
          draft = await persistUpdate(draft, {
            uploadStatus: "RETRY_WAIT",
            retryCount: attempt + 1,
            lastErrorCode: String(httpStatus),
          });
          await sleep(backoffMs(attempt), signal);
          draft = await persistUpdate(draft, { uploadStatus: "UPLOADING" });
          attempt++;
          continue;
        }

        // Non-retryable 4xx
        draft = await persistUpdate(draft, {
          uploadStatus: "FAILED_RECOVERABLE",
          lastErrorCode: String(httpStatus),
        });
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

  // ── Step 4: Complete upload session ────────────────────────────────────────
  draft = await persistUpdate(draft, { uploadStatus: "COMPLETING" });
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
      draft = await persistUpdate(draft, {
        uploadStatus: "FAILED_RECOVERABLE",
        lastErrorCode: status ? String(status) : "COMPLETE_SESSION_FAILED",
      });
      void logUploadError(draft, err, status, "complete_upload_session");
      throw new Error(
        "Upload session completion failed. Your draft was saved — please try again."
      );
    }
  }

  // ── Step 5: Mark submission upload-complete ────────────────────────────────
  draft = await persistUpdate(draft, { uploadStatus: "VERIFYING" });
  onProgress?.({ phase: "verifying", partsComplete: totalParts, partsTotal: totalParts, bytesUploaded });

  try {
    const uploadedMedia = completedMediaId ? [{ mediaId: completedMediaId, fileSize }] : [];
    await markUploadComplete(submissionId, { uploadedMedia });
  } catch (err) {
    const status = extractHttpStatus(err);
    draft = await persistUpdate(draft, {
      uploadStatus: "FAILED_RECOVERABLE",
      lastErrorCode: status ? String(status) : "VERIFY_FAILED",
    });
    void logUploadError(draft, err, status, "mark_upload_complete");
    throw new Error(
      "Failed to confirm submission with the server. Your draft was saved — please try again."
    );
  }

  await persistUpdate(draft, {
    uploadStatus: "COMPLETED",
    uploadedAt: new Date().toISOString(),
  });

  return { submissionId };
}

/**
 * Abort an in-progress upload and reset the draft to LOCAL_READY so the
 * user can retry. Keeps the local draft and all media files.
 */
export async function cancelUpload(draftId: string): Promise<void> {
  cancelUploadById(draftId);
  const draft = await getDraft(draftId);
  if (!draft) return;
  await persistUpdate(draft, { uploadStatus: "LOCAL_READY" });
}

/**
 * Abort the in-progress upload, abort the remote session if not yet completed,
 * and delete the local draft + media files.
 *
 * Re-reads the latest draft state from AsyncStorage before deciding whether to
 * abort the remote session, so it is safe to call even after a successful
 * upload (where the draft is COMPLETED and the session must not be aborted).
 */
export async function abortAndDeleteDraft(draft: LocalDraft): Promise<void> {
  cancelUploadById(draft.id);

  // Read the freshest status from storage — callers may hold a stale reference
  const latest = await getDraft(draft.id);
  const actualStatus = latest?.uploadStatus ?? draft.uploadStatus;

  if (actualStatus !== "COMPLETED") {
    const sessionId = latest?.uploadSessionId ?? draft.uploadSessionId;
    if (sessionId) {
      abortUploadSession(sessionId).catch(() => {});
    }

    const submissionId = latest?.submissionId ?? draft.submissionId;
    if (submissionId) {
      markUploadFailed(submissionId, {
        failureReason: "User deleted draft",
      }).catch(() => {});
    }
  }

  await deleteDraft(draft.id);
}

/**
 * Pre-recording storage check based on estimated video size.
 * bitrateMbps defaults to 40 Mbps (~5 MB/s, typical for 4K).
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
