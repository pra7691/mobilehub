import type { CollectionType } from "./drafts";

export interface ImuCaptureSummary {
  segmentCount: number;
  allEmbedded: boolean;
  totalAccelerometerSamples: number;
  totalGyroscopeSamples: number;
  averageAccelerometerHz: number;
  averageGyroscopeHz: number;
  imuFormat: string;
  imuValidationStatus: string;
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
