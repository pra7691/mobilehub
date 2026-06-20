import type { CollectionType } from "./drafts";

export interface PendingCapture {
  taskId: string;
  collectionType: CollectionType;
  mediaUris: string[];
  durationSeconds?: number;
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
