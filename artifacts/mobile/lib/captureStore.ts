import type { CollectionType } from "./drafts";

export interface ImuCaptureSummary {
  imuEmbedded: boolean;
  imuFormat: string;
  imuTargetHz: number;
  accelerometerSampleCount: number;
  gyroscopeSampleCount: number;
  accelerometerEffectiveHz: number;
  gyroscopeEffectiveHz: number;
  imuCaptureStartedAtRelativeMs: number;
  imuCaptureEndedAtRelativeMs: number;
  imuValidationStatus: string;
  deviceModel: string;
  osVersion: string;
  imuUnavailableReason?: string;
}

export interface PendingCapture {
  taskId: string;
  collectionType: CollectionType;
  mediaUris: string[];
  durationSeconds?: number;
  imuMetadata?: ImuCaptureSummary;
  imuRequired?: boolean;
}

let _pending: PendingCapture | null = null;

export function setPendingCapture(data: PendingCapture): void {
  _pending = data;
}

export function getPendingCapture(): PendingCapture | null {
  return _pending;
}

export function clearPendingCapture(): void {
  _pending = null;
}
