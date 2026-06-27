import { Feather } from "@expo/vector-icons";
import { CameraView, type CameraType, type FlashMode } from "expo-camera";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetTask, useGetAppSettings } from "@workspace/api-client-react";
import {
  isAvailable as imuIsAvailable,
  checkSensorAvailability,
  startCapture as imuStartCapture,
  stopAndEmbed as imuStopAndEmbed,
} from "@workspace/tarzi-imu";
import type { ImuMetadata } from "@workspace/tarzi-imu";

import { PermissionGate } from "@/components/PermissionGate";
import { useTaskPermissions } from "@/hooks/useTaskPermissions";
import { setPendingCapture } from "@/lib/captureStore";
import type { ImuCaptureSummary } from "@/lib/captureStore";
import { reportError } from "@/lib/errorReporting";
import { hasEnoughStorage } from "@/lib/uploadClient";
import {
  saveDraft as saveDraftStorage,
  generateDraftId,
  moveMediaToDrafts,
  type LocalDraft,
} from "@/lib/drafts";

const IMU_TARGET_HZ = 100;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function getDeviceModel(): string {
  return Device.modelName ?? "unknown";
}

function getOsVersion(): string {
  return Device.osVersion ?? "unknown";
}

function buildImuSummary(
  metas: ImuMetadata[],
  captureEndedAtRelativeMs: number
): ImuCaptureSummary {
  const allEmbedded = metas.length > 0 && metas.every((m) => m.imuEmbedded);
  const totalAcc = metas.reduce((s, m) => s + m.accelerometerSampleCount, 0);
  const totalGyro = metas.reduce((s, m) => s + m.gyroscopeSampleCount, 0);
  const avgAccHz =
    metas.length > 0
      ? metas.reduce((s, m) => s + m.accelerometerEffectiveHz, 0) / metas.length
      : 0;
  const avgGyroHz =
    metas.length > 0
      ? metas.reduce((s, m) => s + m.gyroscopeEffectiveHz, 0) / metas.length
      : 0;
  const worstStatus =
    metas.find((m) => m.imuValidationStatus !== "ok")?.imuValidationStatus ??
    "ok";

  return {
    imuEmbedded: allEmbedded,
    imuFormat: metas[0]?.imuFormat ?? "gpmf",
    imuTargetHz: IMU_TARGET_HZ,
    accelerometerSampleCount: totalAcc,
    gyroscopeSampleCount: totalGyro,
    accelerometerEffectiveHz: Math.round(avgAccHz * 10) / 10,
    gyroscopeEffectiveHz: Math.round(avgGyroHz * 10) / 10,
    imuCaptureStartedAtRelativeMs: 0,
    imuCaptureEndedAtRelativeMs: captureEndedAtRelativeMs,
    imuValidationStatus: worstStatus,
    deviceModel: getDeviceModel(),
    osVersion: getOsVersion(),
  };
}

/**
 * Video capture state machine.
 *
 * expo-camera CameraView does not expose pauseRecording/resumeRecording, so
 * pause/resume is implemented via segment-based recording: each pause
 * terminates the current segment, resume starts a new one.
 *
 * IMU lifecycle (when task.recordImu is true):
 *   Sensor gate     — checked once when task data arrives; blocks or shows dialog
 *   startCapture()  — called in recordSegment() before each recordAsync()
 *   stopAndEmbed()  — called after each segment URI is produced (pause + final stop)
 *   "Preparing motion data…" overlay shown during the final-stop embed only
 *
 * Error path for stopAndEmbed failure: always aborts (never navigates to review),
 * shows prescribed message, and logs to Mobile Error Logs.
 */
export default function VideoCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data: task } = useGetTask(taskId ?? "");
  const { data: appSettings } = useGetAppSettings();
  const { granted, request } = useTaskPermissions("VIDEO");

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const segmentsRef = useRef<string[]>([]);
  const segmentDurationsRef = useRef<number[]>([]);
  const actionRef = useRef<"pause" | "stop">("stop");
  const backgroundedRef = useRef(false);
  // Accumulated IMU metadata per segment
  const imuSegmentMetaRef = useRef<ImuMetadata[]>([]);
  // Session start timestamp (ms) for relative timing
  const captureSessionStartMsRef = useRef<number>(0);
  // Why IMU is unavailable when imuSkipped=true
  const imuUnavailableReasonRef = useRef<string>("");
  // Set when the user explicitly discards an active recording so recordSegment
  // skips draft persistence on async completion (distinct from OS backgrounding).
  const wasDiscardedRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [flash, setFlash] = useState<FlashMode>("off");
  const [facing, setFacing] = useState<CameraType>("back");
  const [error, setError] = useState<string | null>(null);
  const [imuWarning, setImuWarning] = useState<string | null>(null);
  // Overlay shown while stopAndEmbed() runs on the final stop
  const [imuProcessing, setImuProcessing] = useState(false);
  // Hard block when imuRequired=true and sensors/module unavailable
  const [imuBlocked, setImuBlocked] = useState(false);
  // True when user chose to continue without IMU (dialog confirmed)
  const [imuSkipped, setImuSkipped] = useState(false);
  // Sensor gate has been evaluated for this task
  const [sensorGateDone, setSensorGateDone] = useState(false);

  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const preferredCamera = task?.preferredCamera ?? "ANY";
  const canToggleCamera = preferredCamera === "ANY";
  const isUltraWide = task?.preferredLens === "ULTRA_WIDE";
  const minDuration = task?.minimumDurationSeconds ?? 0;
  const maxDuration = task?.maximumDurationSeconds ?? 0;
  const taskRecordImu = task?.recordImu ?? false;
  const taskImuRequired = task?.imuRequired ?? false;

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  // Stable refs capturing task data for async interrupt handlers.
  // AppState/backgrounding callbacks run after React state may be stale, so
  // we always read from refs rather than closed-over state values.
  const taskRef = useRef(task);
  const taskImuRequiredRef = useRef(taskImuRequired);
  useEffect(() => { taskRef.current = task; }, [task]);
  useEffect(() => { taskImuRequiredRef.current = taskImuRequired; }, [taskImuRequired]);

  useEffect(() => {
    if (!task) return;
    if (task.preferredCamera === "FRONT") setFacing("front");
    else if (task.preferredCamera === "REAR") setFacing("back");
  }, [task?.preferredCamera]);

  /**
   * Sensor availability gate — evaluates once when task data is loaded.
   *
   * Matrix:
   *   module unavailable + imuRequired  → hard block
   *   module unavailable + !imuRequired → confirmation dialog → imuSkipped
   *   sensors missing   + imuRequired  → hard block
   *   sensors missing   + !imuRequired → confirmation dialog → imuSkipped
   *   all OK                           → nothing (recording proceeds with IMU)
   */
  useEffect(() => {
    if (!task || !taskRecordImu || sensorGateDone) return;

    const handleUnavailable = (reason: string) => {
      if (taskImuRequired) {
        setImuBlocked(true);
        setSensorGateDone(true);
      } else {
        Alert.alert(
          "Motion Sensors Unavailable",
          "Motion data (IMU) cannot be captured on this device. You can still record the video without motion data.",
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => router.back(),
            },
            {
              text: "Continue Anyway",
              onPress: () => {
                imuUnavailableReasonRef.current = reason;
                setImuSkipped(true);
                setSensorGateDone(true);
              },
            },
          ]
        );
      }
    };

    if (!imuIsAvailable()) {
      handleUnavailable("native_module_unavailable");
      return;
    }

    void checkSensorAvailability()
      .then((sensors: { accelerometer: boolean; gyroscope: boolean }) => {
        if (!sensors.accelerometer || !sensors.gyroscope) {
          handleUnavailable("sensors_unavailable");
        } else {
          setSensorGateDone(true);
        }
      })
      .catch(() => {
        // Native call failed — treat as sensors unavailable to avoid indefinite
        // disabled-button state.
        handleUnavailable("sensors_unavailable");
      });
  }, [task, taskRecordImu, taskImuRequired, sensorGateDone, router]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          const next = e + 1;
          if (maxDuration > 0 && next >= maxDuration) {
            actionRef.current = "stop";
            cameraRef.current?.stopRecording();
            if (timerRef.current) clearInterval(timerRef.current);
          }
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused, maxDuration]);

  /**
   * Persist accumulated footage as a LOCAL_READY (or FAILED_RECOVERABLE) draft
   * when recording is interrupted by backgrounding. Uses refs only so it is
   * safe to call from async event handlers with potentially stale closures.
   *
   * Each segment is atomically moved to the persistent drafts directory to
   * avoid double-writing large video files.
   *
   * Declared before the AppState useEffect that calls it to avoid TDZ errors.
   */
  const _saveInterruptedDraft = useCallback(
    async (
      uris: string[],
      imuMetas: ImuMetadata[],
      elapsed: number,
      captureStartMs: number
    ): Promise<void> => {
      const t = taskRef.current;
      if (!t || uris.length === 0) return;

      const draftId = generateDraftId();
      const movedUris: string[] = [];
      for (let i = 0; i < uris.length; i++) {
        try {
          const filename = `${draftId}_seg${i}.mp4`;
          movedUris.push(await moveMediaToDrafts(uris[i]!, filename));
        } catch {
          movedUris.push(uris[i]!); // keep original URI on move failure
        }
      }

      const captureEndedAtMs = Date.now() - captureStartMs;
      const imuSummary =
        imuMetas.length > 0 ? buildImuSummary(imuMetas, captureEndedAtMs) : undefined;
      const imuRequired = taskImuRequiredRef.current;

      // Always store RECORDING_INTERRUPTED so recoverAllRecordingDrafts (called
      // on the next app launch) can perform a full validation pass and resolve
      // the draft to LOCAL_READY, PROCESSING_IMU, or FAILED_RECOVERABLE with
      // accurate file-existence checks. This ensures the recovery path is always
      // exercised rather than bypassed.
      const draft: LocalDraft = {
        id: draftId,
        taskId: taskId ?? "",
        taskTitle: t.title ?? "",
        collectionType: "VIDEO",
        paymentAmount: t.paymentAmount ?? 0,
        currency: t.currency ?? "INR",
        mediaUris: movedUris,
        durationSeconds: elapsed,
        imuMetadata: imuSummary,
        imuRequired,
        createdAt: new Date().toISOString(),
        uploadStatus: "RECORDING_INTERRUPTED",
        completedParts: [],
        retryCount: 0,
        imuProcessingStatus: imuSummary?.imuEmbedded === true ? "done" : "pending",
      };

      try {
        await saveDraftStorage(draft);
      } catch (err) {
        void reportError({
          errorType: "UNKNOWN",
          message: "Failed to save interrupted recording draft",
          metadata: { taskId: taskId, error: String(err) },
        });
      }
    },
    [taskId] // taskRef and taskImuRequiredRef are refs — always current, no dep needed
  );

  const resetRecordingState = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
    setElapsed(0);
    elapsedRef.current = 0;
    segmentsRef.current = [];
    segmentDurationsRef.current = [];
    imuSegmentMetaRef.current = [];
  }, []);

  // Stop recording gracefully when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && isRecording) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (!isPaused) {
          // Active recording segment — stop it; recordSegment handles the draft save
          backgroundedRef.current = true;
          actionRef.current = "stop";
          cameraRef.current?.stopRecording();
        } else {
          // Paused — no active recordAsync in flight, so we must save footage here.
          // Capture all refs synchronously before resetting state.
          const capturedUris = [...segmentsRef.current];
          const capturedImuMetas = [...imuSegmentMetaRef.current];
          const capturedElapsed = elapsedRef.current;
          const capturedStartMs = captureSessionStartMsRef.current;

          if (capturedUris.length > 0) {
            void _saveInterruptedDraft(
              capturedUris,
              capturedImuMetas,
              capturedElapsed,
              capturedStartMs
            ).catch(() => {});
          }

          setIsRecording(false);
          setIsPaused(false);
          setElapsed(0);
          elapsedRef.current = 0;
          segmentsRef.current = [];
          segmentDurationsRef.current = [];
          imuSegmentMetaRef.current = [];
          backgroundedRef.current = false;
        }
      }
    });
    return () => sub.remove();
  }, [isRecording, isPaused, _saveInterruptedDraft]);

  /**
   * Record a single segment. Resolves when stopRecording() is called.
   *
   * IMU lifecycle per segment:
   *   1. startCapture() before recordAsync()
   *   2. stopAndEmbed(uri) after segment completes — timeout applied regardless of isFinalStop
   *   3. On final-stop embed failure: abort (show error, reset, return)
   *   4. On mid-session embed failure: show dismissible warning, keep recording
   *   5. Overlay shown only during the final-stop embed
   */
  const recordSegment = useCallback(async () => {
    if (!cameraRef.current) return;

    const imuActive = taskRecordImu && !imuSkipped && imuIsAvailable();

    if (imuActive) {
      try {
        await imuStartCapture();
      } catch {
        // Non-fatal start failure — IMU will be missing for this segment
      }
    }

    let rawUri: string | undefined;
    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: maxDuration > 0 ? maxDuration : undefined,
      });
      if (result?.uri) {
        rawUri = result.uri;
        const nativeResult = result as typeof result & { duration?: number };
        if (typeof nativeResult.duration === "number" && nativeResult.duration > 0) {
          segmentDurationsRef.current.push(nativeResult.duration);
        }
      }
    } catch {
      // Recording cancelled or failed
    }

    // Always push rawUri first to preserve the original segment URI.
    // On embed success the last entry is replaced with the embedded URI.
    if (rawUri) {
      segmentsRef.current.push(rawUri);
    }

    // Embed IMU data into the segment
    if (rawUri && imuActive) {
      const IMU_EMBED_TIMEOUT_MS = appSettings?.capture?.imuEmbedTimeoutMs ?? 30_000;
      const isFinalStop = actionRef.current === "stop";
      if (isFinalStop) setImuProcessing(true);
      try {
        let timedOut = false;
        const embedResult = await Promise.race([
          imuStopAndEmbed(rawUri),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              timedOut = true;
              reject(new Error("IMU_EMBED_TIMEOUT"));
            }, IMU_EMBED_TIMEOUT_MS)
          ),
        ]);
        void timedOut; // consumed via rejection path
        imuSegmentMetaRef.current.push(embedResult.metadata);
        // Replace the last entry in-place with the GPMF-embedded URI
        segmentsRef.current[segmentsRef.current.length - 1] = embedResult.uri;
      } catch (imuErr) {
        if (isFinalStop) setImuProcessing(false);

        const isTimeout =
          imuErr instanceof Error && imuErr.message === "IMU_EMBED_TIMEOUT";

        const safeMessage = isTimeout
          ? "Motion data processing timed out"
          : imuErr instanceof Error
            ? imuErr.message.slice(0, 300)
            : "IMU embed failed";

        void reportError({
          errorType: "UNKNOWN",
          message: safeMessage,
          metadata: {
            stage: "imu_stop_and_embed",
            taskId,
            platform: Platform.OS,
            deviceModel: getDeviceModel(),
            osVersion: getOsVersion(),
          },
        });

        if (isFinalStop) {
          if (backgroundedRef.current) {
            // App was backgrounded while the final IMU embed was in flight.
            // We cannot show an error to a hidden app — save whatever footage
            // was captured as an interrupted draft and reset state cleanly.
            backgroundedRef.current = false;
            const capturedUris = [...segmentsRef.current];
            const capturedImuMetas = [...imuSegmentMetaRef.current];
            const capturedElapsed = elapsedRef.current;
            const capturedStartMs = captureSessionStartMsRef.current;
            if (capturedUris.length > 0) {
              void _saveInterruptedDraft(
                capturedUris,
                capturedImuMetas,
                capturedElapsed,
                capturedStartMs
              ).catch(() => {});
            }
            resetRecordingState();
            return;
          }
          // Not backgrounded — show error and let user re-record.
          setError(
            isTimeout
              ? "Motion data processing timed out. Please try again."
              : "Motion data could not be added to this video. Please record again."
          );
          setIsRecording(false);
          setIsPaused(false);
          return;
        } else {
          // Mid-session embed failure: raw segment URI is already preserved in
          // segmentsRef. Show a dismissible warning but keep recording so the
          // user can continue and still submit the remaining segments.
          setImuWarning(
            isTimeout
              ? "Motion data timed out for one segment. Recording continues."
              : "Motion data missing for one segment. Recording continues."
          );
        }
      } finally {
        if (isFinalStop) setImuProcessing(false);
      }
    }

    if (wasDiscardedRef.current) {
      // Explicit user discard — stop without saving any draft.
      wasDiscardedRef.current = false;
      backgroundedRef.current = false;
      resetRecordingState();
      return;
    }

    if (backgroundedRef.current) {
      backgroundedRef.current = false;
      // The app was backgrounded during an active segment — save whatever footage
      // was captured before resetting. Fire-and-forget; reset is unconditional.
      const capturedUris = [...segmentsRef.current];
      const capturedImuMetas = [...imuSegmentMetaRef.current];
      const capturedElapsed = elapsedRef.current;
      const capturedStartMs = captureSessionStartMsRef.current;
      if (capturedUris.length > 0) {
        void _saveInterruptedDraft(
          capturedUris,
          capturedImuMetas,
          capturedElapsed,
          capturedStartMs
        ).catch(() => {});
      }
      resetRecordingState();
      return;
    }

    if (actionRef.current === "pause") {
      setIsPaused(true);
    } else {
      // "stop" — validate and navigate to review
      const captureEndedAtMs = Date.now() - captureSessionStartMsRef.current;

      const duration =
        segmentDurationsRef.current.length > 0 &&
        segmentDurationsRef.current.length === segmentsRef.current.length
          ? Math.round(segmentDurationsRef.current.reduce((a, b) => a + b, 0))
          : elapsedRef.current;

      if (minDuration > 0 && duration < minDuration) {
        setError(`Recording too short. Minimum ${minDuration} seconds required.`);
        resetRecordingState();
        return;
      }

      const uris = segmentsRef.current;
      if (uris.length > 0) {
        let imuSummary: ImuCaptureSummary | undefined;

        if (taskRecordImu) {
          if (imuSkipped) {
            imuSummary = {
              imuEmbedded: false,
              imuFormat: "none",
              imuTargetHz: IMU_TARGET_HZ,
              accelerometerSampleCount: 0,
              gyroscopeSampleCount: 0,
              accelerometerEffectiveHz: 0,
              gyroscopeEffectiveHz: 0,
              imuCaptureStartedAtRelativeMs: 0,
              imuCaptureEndedAtRelativeMs: captureEndedAtMs,
              imuValidationStatus: "skipped",
              deviceModel: getDeviceModel(),
              osVersion: getOsVersion(),
              imuUnavailableReason: imuUnavailableReasonRef.current,
            };
          } else if (imuSegmentMetaRef.current.length > 0) {
            imuSummary = buildImuSummary(
              imuSegmentMetaRef.current,
              captureEndedAtMs
            );
          }
        }

        setPendingCapture({
          taskId: taskId ?? "",
          collectionType: "VIDEO",
          mediaUris: uris,
          durationSeconds: duration,
          imuMetadata: imuSummary,
          imuRequired: taskImuRequired,
        });
        resetRecordingState();
        router.replace(`/capture/review?taskId=${taskId ?? ""}`);
      } else {
        setError("Recording failed. Please try again.");
        resetRecordingState();
      }
    }
  }, [
    maxDuration,
    minDuration,
    taskId,
    taskRecordImu,
    taskImuRequired,
    imuSkipped,
    router,
    resetRecordingState,
    appSettings,
  ]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    const hasSpace = await hasEnoughStorage(maxDuration || 600, 50);

    if (!hasSpace) {
      Alert.alert(
        "Insufficient Storage",
        "Your device doesn't have enough free space for this recording. Please free up storage and try again.",
        [{ text: "OK" }]
      );
      return;
    }

    setError(null);
    setElapsed(0);
    elapsedRef.current = 0;
    segmentsRef.current = [];
    segmentDurationsRef.current = [];
    imuSegmentMetaRef.current = [];
    captureSessionStartMsRef.current = Date.now();
    actionRef.current = "stop";
    backgroundedRef.current = false;
    setIsRecording(true);
    setIsPaused(false);
    void recordSegment();
  }, [isRecording, recordSegment]);

  const pauseRecording = useCallback(() => {
    if (!isRecording || isPaused) return;
    actionRef.current = "pause";
    cameraRef.current?.stopRecording();
    if (timerRef.current) clearInterval(timerRef.current);
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (!isRecording || !isPaused) return;
    actionRef.current = "stop";
    setIsPaused(false);
    void recordSegment();
  }, [isRecording, isPaused, recordSegment]);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    if (minDuration > 0 && elapsedRef.current < minDuration) {
      setError(
        `Minimum ${minDuration} seconds required. Currently ${elapsedRef.current}s.`
      );
      return;
    }
    actionRef.current = "stop";
    if (isPaused) {
      // No active recording segment; build summary and navigate directly
      const captureEndedAtMs = Date.now() - captureSessionStartMsRef.current;
      const duration =
        segmentDurationsRef.current.length > 0 &&
        segmentDurationsRef.current.length === segmentsRef.current.length
          ? Math.round(segmentDurationsRef.current.reduce((a, b) => a + b, 0))
          : elapsedRef.current;
      const uris = segmentsRef.current;
      if (uris.length > 0) {
        let imuSummary: ImuCaptureSummary | undefined;

        if (taskRecordImu) {
          if (imuSkipped) {
            imuSummary = {
              imuEmbedded: false,
              imuFormat: "none",
              imuTargetHz: IMU_TARGET_HZ,
              accelerometerSampleCount: 0,
              gyroscopeSampleCount: 0,
              accelerometerEffectiveHz: 0,
              gyroscopeEffectiveHz: 0,
              imuCaptureStartedAtRelativeMs: 0,
              imuCaptureEndedAtRelativeMs: captureEndedAtMs,
              imuValidationStatus: "skipped",
              deviceModel: getDeviceModel(),
              osVersion: getOsVersion(),
              imuUnavailableReason: imuUnavailableReasonRef.current,
            };
          } else if (imuSegmentMetaRef.current.length > 0) {
            imuSummary = buildImuSummary(
              imuSegmentMetaRef.current,
              captureEndedAtMs
            );
          }
        }

        setPendingCapture({
          taskId: taskId ?? "",
          collectionType: "VIDEO",
          mediaUris: uris,
          durationSeconds: duration,
          imuMetadata: imuSummary,
          imuRequired: taskImuRequired,
        });
        resetRecordingState();
        router.replace(`/capture/review?taskId=${taskId ?? ""}`);
      } else {
        setError("No footage recorded.");
        setIsRecording(false);
        setIsPaused(false);
      }
    } else {
      cameraRef.current?.stopRecording();
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [
    isRecording,
    isPaused,
    minDuration,
    taskId,
    taskRecordImu,
    taskImuRequired,
    imuSkipped,
    router,
    resetRecordingState,
  ]);

  const handleClose = useCallback(() => {
    if (isRecording) {
      Alert.alert(
        "Stop Recording?",
        "This will discard the current recording.",
        [
          { text: "Continue Recording", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              actionRef.current = "stop";
              // Use a dedicated flag so recordSegment knows this is a user
              // discard (not an OS background event) and skips draft saving.
              wasDiscardedRef.current = true;
              cameraRef.current?.stopRecording();
              resetRecordingState();
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  }, [isRecording, router, resetRecordingState]);

  const handleRetake = useCallback(() => {
    setError(null);
    setElapsed(0);
    elapsedRef.current = 0;
    segmentsRef.current = [];
    segmentDurationsRef.current = [];
    imuSegmentMetaRef.current = [];
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  if (!granted) {
    return (
      <PermissionGate
        collectionType="VIDEO"
        onRetry={() => void request()}
      />
    );
  }

  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.webNote}>
          Camera capture is not supported on web. Please use the mobile app.
        </Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Hard block — sensors required but unavailable on this device
  if (imuBlocked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Feather name="x" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.topCenter} />
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.blockedCenter}>
          <Feather name="alert-triangle" size={48} color="#f59e0b" />
          <Text style={styles.blockedTitle}>Motion Sensors Required</Text>
          <Text style={styles.blockedBody}>
            This device does not support the motion sensors required for this task.
          </Text>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Text style={styles.closeBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode="video"
          zoom={isUltraWide ? 0 : undefined}
        />
      )}

      {/* "Preparing motion data…" overlay — shown during final-stop IMU embedding */}
      {imuProcessing && (
        <View style={styles.imuOverlay}>
          <ActivityIndicator size="large" color="#06b6d4" />
          <Text style={styles.imuOverlayText}>Preparing motion data…</Text>
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={handleClose}>
          <Feather name="x" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          {isUltraWide && (
            <View style={styles.lensBadge}>
              <Text style={styles.lensBadgeText}>Wide lens preferred</Text>
            </View>
          )}
          {task?.minimumFps != null && (
            <View style={styles.fpsBadge}>
              <Text style={styles.fpsBadgeText}>{task.minimumFps} FPS target</Text>
            </View>
          )}
          {taskRecordImu && (
            <View style={[styles.imuBadge, imuSkipped && styles.imuBadgeSkipped]}>
              <Feather
                name="activity"
                size={11}
                color={imuSkipped ? "#f59e0b" : "#06b6d4"}
              />
              <Text style={[styles.imuBadgeText, imuSkipped && styles.imuBadgeTextSkipped]}>
                {imuSkipped ? "IMU skipped" : taskImuRequired ? "IMU required" : "IMU"}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setFlash((f) => (f === "off" ? "on" : "off"))}
        >
          <Feather
            name={flash === "on" ? "zap" : "zap-off"}
            size={22}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      {isRecording && (
        <View style={styles.timerRow}>
          <View style={[styles.recDot, isPaused && styles.recDotPaused]} />
          <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
          {maxDuration > 0 && (
            <Text style={styles.maxText}>/ {formatTime(maxDuration)}</Text>
          )}
          {isPaused && <Text style={styles.pausedLabel}>PAUSED</Text>}
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRetake}>
            <Text style={styles.retakeLink}>Retake</Text>
          </TouchableOpacity>
        </View>
      )}

      {imuWarning && !error && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>{imuWarning}</Text>
          <TouchableOpacity onPress={() => setImuWarning(null)}>
            <Feather name="x" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Sensor gate spinner — shown while async sensor check is in flight */}
      {taskRecordImu && !sensorGateDone && !imuBlocked && (
        <View style={styles.sensorGateOverlay}>
          <ActivityIndicator size="small" color="#06b6d4" />
          <Text style={styles.sensorGateText}>Checking motion sensors…</Text>
        </View>
      )}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        {canToggleCamera && !isRecording ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          >
            <Feather name="refresh-cw" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}

        {/* Record button is disabled until sensor gate resolves for IMU tasks */}
        <TouchableOpacity
          style={[
            styles.recordBtn,
            isRecording && styles.recordBtnActive,
            (imuProcessing || (taskRecordImu && !sensorGateDone)) &&
              styles.recordBtnDisabled,
          ]}
          onPress={isRecording ? stopRecording : () => void startRecording()}
          activeOpacity={0.8}
          disabled={imuProcessing || (taskRecordImu && !sensorGateDone)}
        >
          {isRecording ? (
            <View style={styles.stopSquare} />
          ) : (
            <View style={styles.recordCircle} />
          )}
        </TouchableOpacity>

        {isRecording ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={isPaused ? resumeRecording : pauseRecording}
            disabled={imuProcessing}
          >
            <Feather
              name={isPaused ? "play" : "pause"}
              size={22}
              color="#fff"
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  topCenter: { flex: 1, alignItems: "center", gap: 4 },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 22,
  },
  lensBadge: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lensBadgeText: { color: "#fbbf24", fontSize: 11, fontFamily: "Inter_500Medium" },
  fpsBadge: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  fpsBadgeText: { color: "#94a3b8", fontSize: 11, fontFamily: "Inter_500Medium" },
  imuBadge: {
    backgroundColor: "rgba(6,182,212,0.15)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  imuBadgeSkipped: {
    backgroundColor: "rgba(245,158,11,0.15)",
    borderColor: "rgba(245,158,11,0.4)",
  },
  imuBadgeText: { color: "#06b6d4", fontSize: 11, fontFamily: "Inter_500Medium" },
  imuBadgeTextSkipped: { color: "#f59e0b" },
  timerRow: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  recDotPaused: { backgroundColor: "#f59e0b" },
  timerText: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  maxText: { color: "#9ca3af", fontSize: 14, fontFamily: "Inter_400Regular" },
  pausedLabel: { color: "#f59e0b", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  errorBanner: {
    position: "absolute",
    bottom: 140,
    left: 16,
    right: 16,
    backgroundColor: "rgba(239,68,68,0.9)",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  errorText: { flex: 1, color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  retakeLink: {
    color: "#fef2f2",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textDecorationLine: "underline",
  },
  warningBanner: {
    position: "absolute",
    bottom: 140,
    left: 16,
    right: 16,
    backgroundColor: "rgba(180,100,0,0.88)",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  warningText: { flex: 1, color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    paddingTop: 20,
  },
  recordBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  recordBtnActive: { borderColor: "#ef4444" },
  recordCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#ef4444" },
  stopSquare: { width: 24, height: 24, borderRadius: 4, backgroundColor: "#ef4444" },
  webNote: {
    color: "#9ca3af",
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    padding: 40,
  },
  closeBtn: {
    alignSelf: "center",
    backgroundColor: "#164e63",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  closeBtnText: { color: "#06b6d4", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  imuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 10,
  },
  imuOverlayText: {
    color: "#e2e8f0",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  blockedCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  blockedTitle: {
    color: "#f59e0b",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  blockedBody: {
    color: "#94a3b8",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  recordBtnDisabled: { opacity: 0.45 },
  sensorGateOverlay: {
    position: "absolute",
    bottom: 160,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sensorGateText: {
    color: "#94a3b8",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
