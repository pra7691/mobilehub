import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import type { ImuCaptureSummary } from "./captureStore";
import type { UploadStatus, CompletedPart } from "./uploadStateMachine";
import { IN_PROGRESS_STATUSES } from "./uploadStateMachine";

export type CollectionType = "VIDEO" | "IMAGE" | "AUDIO";

export interface LocalDraft {
  id: string;
  taskId: string;
  taskTitle: string;
  collectionType: CollectionType;
  paymentAmount: number;
  currency: string;
  mediaUris: string[];
  durationSeconds?: number;
  imageCount?: number;
  imuMetadata?: ImuCaptureSummary;
  imuRequired?: boolean;
  createdAt: string;

  uploadStatus: UploadStatus;

  submissionId?: string;
  uploadSessionId?: string;
  storageProfileId?: string;
  completedParts?: CompletedPart[];
  retryCount?: number;
  lastErrorCode?: string;
  uploadedAt?: string;

  imuProcessingStatus?: "pending" | "processing" | "done" | "failed";
  imuValidationStatus?: "ok" | "no_gpmf" | "insufficient" | "error";
}

interface LegacyLocalDraft {
  id: string;
  taskId: string;
  taskTitle: string;
  collectionType: CollectionType;
  paymentAmount: number;
  currency: string;
  mediaUris: string[];
  durationSeconds?: number;
  imageCount?: number;
  imuMetadata?: ImuCaptureSummary;
  imuRequired?: boolean;
  createdAt: string;
  status?: "ready_to_upload";
  uploadStatus?: UploadStatus;
}

function migrateDraft(raw: LegacyLocalDraft): LocalDraft {
  if (raw.uploadStatus !== undefined) {
    return raw as LocalDraft;
  }
  const { status: _dropped, ...rest } = raw;
  void _dropped;
  return { ...rest, uploadStatus: "LOCAL_READY" };
}

const STORAGE_KEY = "capto_drafts";
export const DRAFTS_DIR = `${FileSystem.documentDirectory}capto_drafts/`;

async function ensureDraftsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DRAFTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DRAFTS_DIR, { intermediates: true });
  }
}

export async function listDrafts(): Promise<LocalDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LegacyLocalDraft[];
    return parsed.map(migrateDraft);
  } catch {
    return [];
  }
}

export async function saveDraft(draft: LocalDraft): Promise<void> {
  const drafts = await listDrafts();
  const idx = drafts.findIndex((d) => d.id === draft.id);
  if (idx >= 0) {
    drafts[idx] = draft;
  } else {
    drafts.unshift(draft);
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export async function getDraft(id: string): Promise<LocalDraft | null> {
  const drafts = await listDrafts();
  return drafts.find((d) => d.id === id) ?? null;
}

export async function deleteDraft(id: string): Promise<void> {
  const drafts = await listDrafts();
  const draft = drafts.find((d) => d.id === id);
  if (draft) {
    for (const uri of draft.mediaUris) {
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      } catch {
        // best-effort cleanup
      }
    }
  }
  const updated = drafts.filter((d) => d.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * On app startup, transition any drafts that were in-progress when the app
 * was killed to PAUSED_APP_RESTART so the user can resume them explicitly.
 */
export async function recoverInterruptedDrafts(): Promise<boolean> {
  const drafts = await listDrafts();
  const hasInterrupted = drafts.some((d) => IN_PROGRESS_STATUSES.has(d.uploadStatus));
  if (!hasInterrupted) return false;

  const updated = drafts.map((d) =>
    IN_PROGRESS_STATUSES.has(d.uploadStatus)
      ? { ...d, uploadStatus: "PAUSED_APP_RESTART" as UploadStatus }
      : d
  );
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return true;
}

export async function copyMediaToDrafts(
  sourceUri: string,
  filename: string
): Promise<string> {
  await ensureDraftsDir();
  const dest = `${DRAFTS_DIR}${filename}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export function generateDraftId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
