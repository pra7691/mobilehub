import * as FileSystem from "expo-file-system/legacy";
import {
  initiateSubmission,
  markUploadComplete,
  markUploadFailed,
} from "@workspace/api-client-react";
import type { LocalDraft } from "./drafts";
import { reportError } from "./errorReporting";

export type SubmitPhase = "preparing" | "uploading" | "submitting";

export interface SubmitProgress {
  phase: SubmitPhase;
  current: number;
  total: number;
}

function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4a: "audio/mp4",
    aac: "audio/aac",
    mp3: "audio/mpeg",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function submitDraft(
  draft: LocalDraft,
  onProgress?: (progress: SubmitProgress) => void,
  signal?: AbortSignal
): Promise<{ submissionId: string }> {
  onProgress?.({
    phase: "preparing",
    current: 0,
    total: draft.mediaUris.length,
  });

  // Gather file metadata
  const mediaFiles: Array<{
    filename: string;
    fileSize?: number;
    contentType?: string;
  }> = [];
  for (const uri of draft.mediaUris) {
    const filename = uri.split("/").pop() ?? "media";
    const contentType = getContentType(filename);
    let fileSize: number | undefined;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && "size" in info) fileSize = info.size;
    } catch {
      // ignore
    }
    mediaFiles.push({ filename, fileSize, contentType });
  }

  if (signal?.aborted) throw new Error("Upload cancelled");

  // Step 1: Initiate — create submission record + get presigned upload URLs
  let submissionId: string;
  let uploadTargets: Array<{ mediaId: string; uploadUrl: string; filename: string; storageKey: string; sortOrder: number }>;

  // IMU upload guard — block submission if IMU data is required but not embedded
  if (draft.imuRequired && (!draft.imuMetadata || !draft.imuMetadata.allEmbedded)) {
    throw new Error(
      "This task requires motion sensor data (IMU) to be captured. Please retake the video."
    );
  }

  try {
    const result = await initiateSubmission({
      taskId: draft.taskId,
      mediaFiles,
      durationSeconds: draft.durationSeconds,
      imageCount:
        draft.collectionType === "IMAGE" ? draft.mediaUris.length : undefined,
      captureMetadata: draft.imuMetadata
        ? { imu: draft.imuMetadata }
        : undefined,
    });
    submissionId = result.submissionId;
    uploadTargets = result.uploadTargets;
  } catch (err) {
    const isApiError = err && typeof err === "object" && "status" in err;
    await reportError({
      errorType: "SUBMISSION_INITIATE_FAILED",
      message: err instanceof Error ? err.message : String(err),
      endpoint: "/api/submissions/initiate",
      httpMethod: "POST",
      httpStatus: isApiError ? (err as { status: number }).status : undefined,
      collectionType: draft.collectionType,
      metadata: {
        taskId: draft.taskId,
        fileCount: draft.mediaUris.length,
      },
    });
    throw err;
  }

  if (signal?.aborted) {
    await markUploadFailed(submissionId, {
      failureReason: "Upload cancelled by user",
    }).catch(() => {});
    throw new Error("Upload cancelled");
  }

  // Step 2: Upload each file to its presigned URL
  const uploadedMedia: Array<{ mediaId: string; fileSize?: number }> = [];
  const failedMediaIds: string[] = [];
  const failedDetails: Array<{ mediaId: string; error: string }> = [];

  for (let i = 0; i < uploadTargets.length; i++) {
    const target = uploadTargets[i]!;
    const uri = draft.mediaUris[i];

    if (!uri) {
      failedMediaIds.push(target.mediaId);
      failedDetails.push({ mediaId: target.mediaId, error: "URI missing" });
      continue;
    }

    onProgress?.({
      phase: "uploading",
      current: i + 1,
      total: uploadTargets.length,
    });

    if (signal?.aborted) {
      failedMediaIds.push(...uploadTargets.slice(i).map((t) => t.mediaId));
      break;
    }

    try {
      const contentType = getContentType(target.filename);
      const result = await FileSystem.uploadAsync(target.uploadUrl, uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": contentType },
      });

      if (result.status >= 200 && result.status < 300) {
        let fileSize: number | undefined;
        try {
          const info = await FileSystem.getInfoAsync(uri);
          if (info.exists && "size" in info) fileSize = info.size;
        } catch {
          /* ignore */
        }
        uploadedMedia.push({ mediaId: target.mediaId, fileSize });
      } else {
        failedMediaIds.push(target.mediaId);
        failedDetails.push({
          mediaId: target.mediaId,
          error: `HTTP ${result.status}: ${result.body?.slice(0, 200) ?? ""}`,
        });
      }
    } catch (err) {
      failedMediaIds.push(target.mediaId);
      failedDetails.push({
        mediaId: target.mediaId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // If any files failed, mark the whole submission as failed and report
  if (failedMediaIds.length > 0) {
    await markUploadFailed(submissionId, {
      failureReason: `${failedMediaIds.length} file(s) failed to upload`,
      failedMediaIds,
    }).catch(() => {});

    await reportError({
      errorType: "SUBMISSION_UPLOAD_FAILED",
      message: `${failedMediaIds.length} of ${uploadTargets.length} file(s) failed to upload`,
      collectionType: draft.collectionType,
      metadata: {
        taskId: draft.taskId,
        submissionId,
        failedCount: failedMediaIds.length,
        totalCount: uploadTargets.length,
        failures: failedDetails,
      },
    });

    throw new Error(
      `${failedMediaIds.length} of ${uploadTargets.length} file(s) failed to upload. Your draft was saved — please try submitting again.`
    );
  }

  if (signal?.aborted) {
    await markUploadFailed(submissionId, {
      failureReason: "Upload cancelled by user",
    }).catch(() => {});
    throw new Error("Upload cancelled");
  }

  // Step 3: Mark upload complete → server sets status to UNDER_REVIEW
  onProgress?.({
    phase: "submitting",
    current: uploadTargets.length,
    total: uploadTargets.length,
  });

  try {
    await markUploadComplete(submissionId, { uploadedMedia });
  } catch (err) {
    const isApiError = err && typeof err === "object" && "status" in err;
    await reportError({
      errorType: "API_ERROR",
      message: err instanceof Error ? err.message : String(err),
      endpoint: `/api/submissions/${submissionId}/upload-complete`,
      httpMethod: "POST",
      httpStatus: isApiError ? (err as { status: number }).status : undefined,
      collectionType: draft.collectionType,
      metadata: { taskId: draft.taskId, submissionId },
    });
    throw err;
  }

  return { submissionId };
}
