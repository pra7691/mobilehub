/**
 * BackgroundUploadManager
 *
 * Unified interface for uploading video drafts, routing to native background
 * transfer when available and falling back to the JS multipart client otherwise.
 *
 * ── Native background transfer (requires EAS development build) ───────────────
 *
 * Android — WorkManager + visible foreground service notification.
 *   Each upload part is enqueued as a WorkManager OneTimeWorkRequest carrying
 *   the part's byte range, presigned URL, and expected ETag. On completion the
 *   native callback applies the PART_COMPLETE state machine event and persists
 *   the updated draft to AsyncStorage before returning. Upload automatically
 *   resumes after force-stop, reboot, or network change.
 *
 * iOS — Background URLSession with a persistent identifier.
 *   The AppDelegate must implement:
 *     application(_:handleEventsForBackgroundURLSession:completionHandler:)
 *   to restore the session and process completion events after app suspension.
 *   The session is re-registered on every launch so completions queued by the
 *   OS while the app was killed are collected.
 *
 * Both platforms — completed-part notifications from the native layer are
 *   translated into state machine events (PART_COMPLETE / COMPLETING / etc.)
 *   and persisted to AsyncStorage before the native callback returns.
 *
 * ── JS fallback (works in Expo Go and standard dev builds) ───────────────────
 *
 * When the native module is unavailable, all uploads use the JS multipart
 * client (startVideoUpload). This path has full retry/backoff, state machine
 * persistence, and NetInfo-driven pause/resume; it just cannot continue after
 * the app is fully killed by the OS.
 */

import { startVideoUpload, type VideoUploadProgress } from "./uploadClient";
import type { LocalDraft } from "./drafts";

/**
 * Returns true when the native background upload Expo module is loaded and
 * ready to queue parts via WorkManager (Android) or background URLSession (iOS).
 *
 * Currently always returns false — will return true once the EAS build that
 * includes the native CaptoBackgroundUpload module is deployed.
 */
export function isNativeBackgroundUploadAvailable(): boolean {
  // TODO: replace with real module check once the native module is built, e.g.:
  //   import { NativeModules } from "react-native";
  //   return !!NativeModules.CaptoBackgroundUpload;
  return false;
}

/**
 * Upload a video draft, routing through native background transfer when
 * available or falling back to the JS multipart client.
 *
 * The `onProgress` callback and `signal` are honoured in both paths. The
 * native path translates WorkManager / URLSession callbacks into the same
 * VideoUploadProgress shape so callers are path-agnostic.
 */
export async function uploadWithFallback(
  draft: LocalDraft,
  onProgress?: (p: VideoUploadProgress) => void,
  signal?: AbortSignal
): Promise<{ submissionId: string }> {
  if (isNativeBackgroundUploadAvailable()) {
    // TODO: delegate to the native CaptoBackgroundUpload module here.
    //
    // Native module responsibilities:
    //   1. Receive the draft (serialize to JSON, pass via NativeModule bridge).
    //   2. For each pending part, enqueue a WorkManager OneTimeWorkRequest (Android)
    //      or a background URLSession uploadTask (iOS).
    //   3. In the native completion callback:
    //        a. Apply applyTransition(draft, { type: "PART_COMPLETE", part }, saveDraft)
    //        b. If last part: apply COMPLETING → VERIFYING → COMPLETE.
    //        c. On error: apply FAIL_RECOVERABLE or FAIL_FINAL.
    //   4. Forward progress updates via the EventEmitter bridge so onProgress fires.
    //
    throw new Error(
      "[BackgroundUploadManager] Native module is declared available but no implementation is registered. " +
        "This is a bug — isNativeBackgroundUploadAvailable() should only return true when the module is fully wired up."
    );
  }

  // JS fallback — full-featured multipart client with retry, exponential
  // backoff + jitter, NetInfo-driven pause/resume, and state machine
  // persistence. Works in Expo Go and standard builds.
  return startVideoUpload(draft, onProgress, signal);
}
