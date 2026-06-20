import * as FileSystem from "expo-file-system";
import { requestUploadUrl, createSubmission } from "@workspace/api-client-react";
import type { LocalDraft } from "./drafts";

export type SubmitPhase = "uploading" | "submitting";

export interface SubmitProgress {
  phase: SubmitPhase;
  current: number;
  total: number;
}

function getContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case "mp4":
      return "video/mp4";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

export async function submitDraft(
  draft: LocalDraft,
  onProgress?: (progress: SubmitProgress) => void
): Promise<{ submissionId: string }> {
  const objectPaths: string[] = [];

  for (let i = 0; i < draft.mediaUris.length; i++) {
    onProgress?.({ phase: "uploading", current: i + 1, total: draft.mediaUris.length });

    const uri = draft.mediaUris[i]!;
    const ext = uri.split(".").pop() ?? "bin";
    const contentType = getContentType(ext);

    const info = await FileSystem.getInfoAsync(uri);
    const size = info.exists && "size" in info ? info.size : 0;

    const { uploadURL, objectPath } = await requestUploadUrl({
      name: `media_${i}.${ext}`,
      size,
      contentType,
    });

    const result = await FileSystem.uploadAsync(uploadURL, uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": contentType },
    });

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`File upload failed with status ${result.status}`);
    }

    objectPaths.push(objectPath);
  }

  onProgress?.({
    phase: "submitting",
    current: draft.mediaUris.length,
    total: draft.mediaUris.length,
  });

  const submission = await createSubmission({
    taskId: draft.taskId,
    mediaUrls: objectPaths,
  });

  return { submissionId: submission.id };
}
