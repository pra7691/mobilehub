import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import NetInfo from "@react-native-community/netinfo";

import { createMobileErrorLog } from "@workspace/api-client-react";

const QUEUE_KEY = "@capto/error_queue";
const MAX_QUEUE_SIZE = 50;

export type ErrorType =
  | "SUBMISSION_UPLOAD_FAILED"
  | "SUBMISSION_INITIATE_FAILED"
  | "API_ERROR"
  | "RENDER_ERROR"
  | "NETWORK_ERROR"
  | "DRAFT_SAVE_FAILED"
  | "AUDIO_ERROR"
  | "UNKNOWN";

export interface ErrorReport {
  errorType: ErrorType;
  errorCode?: string;
  message: string;
  stackTrace?: string;
  endpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  requestId?: string;
  networkState?: string;
  collectionType?: string;
  metadata?: Record<string, unknown>;
}

interface QueuedReport extends ErrorReport {
  queuedAt: string;
  attemptCount: number;
}

function getPlatform(): string {
  return Platform.OS;
}

function getAppVersion(): string {
  return Constants.expoConfig?.version ?? "unknown";
}

/**
 * Returns a safe, credential-free snapshot of the API and build environment.
 * These fields appear in every error report so admin incidents clearly show
 * which backend and DB the mobile app was connected to.
 *
 * apiOrigin: hostname from EXPO_PUBLIC_API_BASE_URL, or "local" when unset.
 * appVariant: "metro-dev" | "eas-dev" | "production" | "unknown".
 */
function getEnvContext(): { apiOrigin: string; appVariant: string } {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  let apiOrigin = "local";
  try {
    if (raw && !raw.startsWith("/")) {
      apiOrigin = new URL(raw).hostname;
    }
  } catch {
    // keep "local"
  }

  let appVariant: string;
  if (__DEV__) {
    appVariant = "metro-dev";
  } else if (process.env.EXPO_PUBLIC_APP_VARIANT === "development") {
    appVariant = "eas-dev";
  } else if (process.env.EXPO_PUBLIC_APP_VARIANT === "production") {
    appVariant = "production";
  } else {
    appVariant = "unknown";
  }

  return { apiOrigin, appVariant };
}

async function getNetworkState(): Promise<string> {
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) return "none";
    return state.type ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function loadQueue(): Promise<QueuedReport[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedReport[];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedReport[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage errors
  }
}

async function sendReport(report: QueuedReport): Promise<void> {
  await createMobileErrorLog({
    errorType: report.errorType,
    errorCode: report.errorCode,
    message: report.message,
    stackTrace: report.stackTrace,
    endpoint: report.endpoint,
    httpMethod: report.httpMethod,
    httpStatus: report.httpStatus,
    requestId: report.requestId,
    platform: getPlatform(),
    appVersion: getAppVersion(),
    networkState: report.networkState,
    collectionType: report.collectionType,
    metadata: report.metadata ?? {},
  });
}

/**
 * Report an error. If online and authenticated, sends immediately.
 * Falls back to an AsyncStorage offline queue that is drained on startup.
 * Unauthenticated errors also fall into the queue and are drained on next login.
 */
export async function reportError(report: ErrorReport): Promise<void> {
  const networkState = report.networkState ?? (await getNetworkState());
  const envCtx = getEnvContext();
  const enriched: QueuedReport = {
    ...report,
    networkState,
    // Merge env context into metadata so every admin incident shows
    // which API host and build variant the mobile app was connected to.
    metadata: { apiOrigin: envCtx.apiOrigin, appVariant: envCtx.appVariant, ...report.metadata },
    queuedAt: new Date().toISOString(),
    attemptCount: 0,
  };

  try {
    await sendReport(enriched);
  } catch {
    // Queue for retry when offline or unauthenticated
    const queue = await loadQueue();
    queue.unshift(enriched);
    await saveQueue(queue.slice(0, MAX_QUEUE_SIZE));
  }
}

/**
 * Drain the offline queue — call this after successful login / on app start.
 * Sends queued reports in order, stops on first failure to avoid hammering the API.
 */
export async function drainErrorQueue(): Promise<void> {
  const queue = await loadQueue();
  if (queue.length === 0) return;

  const remaining: QueuedReport[] = [];
  for (const item of queue) {
    try {
      await sendReport(item);
    } catch {
      remaining.push({ ...item, attemptCount: item.attemptCount + 1 });
    }
  }
  await saveQueue(remaining);
}

/**
 * Report a render error caught by the ErrorBoundary.
 */
export async function reportRenderError(
  error: Error,
  componentStack: string
): Promise<void> {
  await reportError({
    errorType: "RENDER_ERROR",
    message: error.message.slice(0, 500),
    stackTrace: componentStack.slice(0, 2000),
    metadata: { name: error.name },
  });
}
