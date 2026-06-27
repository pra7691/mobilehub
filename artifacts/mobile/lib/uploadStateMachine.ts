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
    case "RECORDING": return "Recording";
    case "RECORDING_INTERRUPTED": return "Interrupted";
    case "PROCESSING_IMU": return "Processing IMU";
    case "LOCAL_READY": return "Ready to Upload";
    case "QUEUED": return "Queued";
    case "UPLOADING": return "Uploading";
    case "PAUSED_NO_NETWORK": return "No Network";
    case "PAUSED_APP_RESTART": return "Paused";
    case "RETRY_WAIT": return "Retrying";
    case "COMPLETING": return "Finishing";
    case "VERIFYING": return "Verifying";
    case "COMPLETED": return "Submitted";
    case "FAILED_RECOVERABLE": return "Upload Needs Attention";
    case "FAILED_FINAL": return "Upload Failed";
    case "CANCELLED": return "Cancelled";
  }
}
