import { Feather } from "@expo/vector-icons";
import { CameraView, type CameraType, type FlashMode } from "expo-camera";
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
import { useGetTask } from "@workspace/api-client-react";
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

const LOW_STORAGE_BYTES = 200 * 1024 * 1024; // 200 MB

async function hasSufficientStorage(): Promise<boolean> {
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    return free >= LOW_STORAGE_BYTES;
  } catch {
    return true;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function buildImuSummary(metas: ImuMetadata[]): ImuCaptureSummary {
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
  const imuFormat = metas[0]?.imuFormat ?? "none";

  return {
    segmentCount: metas.length,
    allEmbedded,
    totalAccelerometerSamples: totalAcc,
    totalGyroscopeSamples: totalGyro,
    averageAccelerometerHz: Math.round(avgAccHz * 10) / 10,
    averageGyroscopeHz: Math.round(avgGyroHz * 10) / 10,
    imuFormat,
    imuValidationStatus: worstStatus,
  };
}

/**
 * Video capture state machine.
 * expo-camera CameraView does not expose pauseRecording/resumeRecording, so
 * pause/resume is implemented via segment-based recording: each pause
 * terminates the current segment, resume starts a new one. All segment URIs
 * are collected and stored in the draft together.
 *
 * IMU lifecycle (when task.recordImu is true and native module is available):
 *   startCapture()   — called inside recordSegment(), before recordAsync()
 *   stopAndEmbed()   — called after each segment URI is produced
 *   A "Preparing motion data…" overlay is shown during stopAndEmbed.
 */
export default function VideoCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data: task } = useGetTask(taskId ?? "");
  const { granted, request } = useTaskPermissions("VIDEO");

  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Segment-based approach for pause/resume support
  const segmentsRef = useRef<string[]>([]);
  // Durations reported by the camera for each segment (populated when available)
  const segmentDurationsRef = useRef<number[]>([]);
  // Tracks intent when stopRecording() is called
  const actionRef = useRef<"pause" | "stop">("stop");
  // Set to true when the app backgrounds mid-recording so we discard rather than navigate
  const backgroundedRef = useRef(false);
  // Accumulated IMU metadata per segment
  const imuSegmentMetaRef = useRef<ImuMetadata[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [flash, setFlash] = useState<FlashMode>("off");
  const [facing, setFacing] = useState<CameraType>("back");
  const [error, setError] = useState<string | null>(null);
  // Shown while stopAndEmbed() is running between last segment and review navigation
  const [imuProcessing, setImuProcessing] = useState(false);
  // True when sensors are unavailable and the task requires IMU
  const [imuBlocked, setImuBlocked] = useState(false);

  // Gate CameraView on focus so camera hardware releases whenever
  // the route leaves the stack (belt-and-suspenders beyond the push→replace fix).
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

  // Keep elapsed ref in sync (needed in callbacks)
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  // Sync facing with task preferred camera once task data arrives
  useEffect(() => {
    if (!task) return;
    if (task.preferredCamera === "FRONT") setFacing("front");
    else if (task.preferredCamera === "REAR") setFacing("back");
  }, [task?.preferredCamera]);

  // Sensor availability gate — checked once when task data arrives
  useEffect(() => {
    if (!taskRecordImu || !imuIsAvailable()) return;
    void checkSensorAvailability().then((sensors: { accelerometer: boolean; gyroscope: boolean }) => {
      if (!sensors.accelerometer || !sensors.gyroscope) {
        if (taskImuRequired) {
          setImuBlocked(true);
        }
      }
    });
  }, [taskRecordImu, taskImuRequired]);

  // Stop recording gracefully when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && isRecording) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (!isPaused) {
          // Active recording segment running — signal a background stop so
          // recordSegment() discards instead of navigating to review
          backgroundedRef.current = true;
          actionRef.current = "stop";
          cameraRef.current?.stopRecording();
        } else {
          // Paused: no active camera segment, reset state directly
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
  }, [isRecording, isPaused]);

  // Timer — runs only when recording and not paused
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

  /** Record a single segment. Resolves when stopRecording() is called. */
  const recordSegment = useCallback(async () => {
    if (!cameraRef.current) return;

    // Start IMU capture before the camera segment begins
    if (taskRecordImu && imuIsAvailable()) {
      try {
        await imuStartCapture();
      } catch {
        // Non-fatal — proceed without IMU for this segment
      }
    }

    let rawUri: string | undefined;
    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: maxDuration > 0 ? maxDuration : undefined,
      });
      if (result?.uri) {
        rawUri = result.uri;
        // Use camera-reported duration when available to avoid timer drift
        const nativeResult = result as typeof result & { duration?: number };
        if (typeof nativeResult.duration === "number" && nativeResult.duration > 0) {
          segmentDurationsRef.current.push(nativeResult.duration);
        }
      }
    } catch {
      // Recording cancelled or failed — no-op
    }

    // Embed IMU data into the segment (show overlay while muxing)
    let finalUri = rawUri;
    if (rawUri && taskRecordImu && imuIsAvailable()) {
      setImuProcessing(true);
      try {
        const embedResult = await imuStopAndEmbed(rawUri);
        finalUri = embedResult.uri;
        imuSegmentMetaRef.current.push(embedResult.metadata);
      } catch (imuErr) {
        void reportError({
          errorType: "UNKNOWN",
          message:
            imuErr instanceof Error ? imuErr.message : "IMU embed failed",
          metadata: {
            stage: "stopAndEmbed",
            taskId,
            platform: Platform.OS,
            segmentIndex: imuSegmentMetaRef.current.length,
          },
        });

        if (taskImuRequired) {
          // IMU is required and embed failed — abort without navigating
          setImuProcessing(false);
          setError(
            "Motion data capture failed. This task requires IMU data — please retake."
          );
          setIsRecording(false);
          setIsPaused(false);
          setElapsed(0);
          elapsedRef.current = 0;
          segmentsRef.current = [];
          segmentDurationsRef.current = [];
          imuSegmentMetaRef.current = [];
          return;
        }

        // Not required — record a failed-embed stub so the summary stays accurate
        imuSegmentMetaRef.current.push({
          imuEmbedded: false,
          imuFormat: "none",
          accelerometerSampleCount: 0,
          gyroscopeSampleCount: 0,
          accelerometerEffectiveHz: 0,
          gyroscopeEffectiveHz: 0,
          imuValidationStatus: "embed_failed",
        });
      } finally {
        setImuProcessing(false);
      }
    }

    if (finalUri) {
      segmentsRef.current.push(finalUri);
    }

    // Discarded due to app backgrounding — reset cleanly without navigating
    if (backgroundedRef.current) {
      backgroundedRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      setElapsed(0);
      elapsedRef.current = 0;
      segmentsRef.current = [];
      segmentDurationsRef.current = [];
      imuSegmentMetaRef.current = [];
      return;
    }

    // Decide what to do based on intent
    if (actionRef.current === "pause") {
      setIsPaused(true);
    } else {
      // "stop" — validate and navigate
      // Prefer actual camera-reported durations when we have them for all segments
      const duration =
        segmentDurationsRef.current.length > 0 &&
        segmentDurationsRef.current.length === segmentsRef.current.length
          ? Math.round(
              segmentDurationsRef.current.reduce((a, b) => a + b, 0)
            )
          : elapsedRef.current;

      if (minDuration > 0 && duration < minDuration) {
        setError(`Recording too short. Minimum ${minDuration} seconds required.`);
        setIsRecording(false);
        setIsPaused(false);
        setElapsed(0);
        elapsedRef.current = 0;
        segmentsRef.current = [];
        segmentDurationsRef.current = [];
        imuSegmentMetaRef.current = [];
        return;
      }

      const uris = segmentsRef.current;
      if (uris.length > 0) {
        const imuSummary =
          imuSegmentMetaRef.current.length > 0
            ? buildImuSummary(imuSegmentMetaRef.current)
            : undefined;

        setPendingCapture({
          taskId: taskId ?? "",
          collectionType: "VIDEO",
          mediaUris: uris,
          durationSeconds: duration,
          imuMetadata: imuSummary,
          imuRequired: taskImuRequired,
        });
        setIsRecording(false);
        setIsPaused(false);
        setElapsed(0);
        elapsedRef.current = 0;
        segmentsRef.current = [];
        segmentDurationsRef.current = [];
        imuSegmentMetaRef.current = [];
        // replace (not push) so the camera screen unmounts — prevents the camera
        // preview from staying active behind the review screen.
        router.replace(`/capture/review?taskId=${taskId ?? ""}`);
      } else {
        setError("Recording failed. Please try again.");
        setIsRecording(false);
        setElapsed(0);
        elapsedRef.current = 0;
        segmentDurationsRef.current = [];
        imuSegmentMetaRef.current = [];
      }
    }
  }, [maxDuration, minDuration, taskId, taskRecordImu, taskImuRequired, router]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    const hasSpace = await hasSufficientStorage();
    if (!hasSpace) {
      Alert.alert(
        "Low Storage",
        "Your device has less than 200 MB of free space. Recording may fail or be cut short.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Record Anyway",
            onPress: () => {
              setError(null);
              setElapsed(0);
              elapsedRef.current = 0;
              segmentsRef.current = [];
              segmentDurationsRef.current = [];
              imuSegmentMetaRef.current = [];
              actionRef.current = "stop";
              backgroundedRef.current = false;
              setIsRecording(true);
              setIsPaused(false);
              void recordSegment();
            },
          },
        ]
      );
      return;
    }
    setError(null);
    setElapsed(0);
    elapsedRef.current = 0;
    segmentsRef.current = [];
    segmentDurationsRef.current = [];
    imuSegmentMetaRef.current = [];
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
    actionRef.current = "stop"; // default; will be overridden if pause is pressed again
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
      // No active recording segment, go directly to review
      const duration =
        segmentDurationsRef.current.length > 0 &&
        segmentDurationsRef.current.length === segmentsRef.current.length
          ? Math.round(
              segmentDurationsRef.current.reduce((a, b) => a + b, 0)
            )
          : elapsedRef.current;
      const uris = segmentsRef.current;
      if (uris.length > 0) {
        const imuSummary =
          imuSegmentMetaRef.current.length > 0
            ? buildImuSummary(imuSegmentMetaRef.current)
            : undefined;

        setPendingCapture({
          taskId: taskId ?? "",
          collectionType: "VIDEO",
          mediaUris: uris,
          durationSeconds: duration,
          imuMetadata: imuSummary,
          imuRequired: taskImuRequired,
        });
        setIsRecording(false);
        setIsPaused(false);
        setElapsed(0);
        elapsedRef.current = 0;
        segmentsRef.current = [];
        segmentDurationsRef.current = [];
        imuSegmentMetaRef.current = [];
        // replace (not push) so the camera screen unmounts
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
  }, [isRecording, isPaused, minDuration, taskId, taskImuRequired, router]);

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
              backgroundedRef.current = true;
              cameraRef.current?.stopRecording();
              setIsRecording(false);
              setIsPaused(false);
              setElapsed(0);
              elapsedRef.current = 0;
              segmentsRef.current = [];
              segmentDurationsRef.current = [];
              imuSegmentMetaRef.current = [];
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  }, [isRecording, router]);

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

  // IMU sensor blocked — task requires sensors that are unavailable on this device
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
            This task requires accelerometer and gyroscope data, but your device
            does not have the necessary sensors available. Please use a device
            with motion sensors to complete this task.
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
      {/* CameraView only mounts while this route is focused so the camera
          hardware releases if the route is ever left in the stack. */}
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

      {/* IMU processing overlay — shown while muxing GPMF data into the last segment */}
      {imuProcessing && (
        <View style={styles.imuOverlay}>
          <ActivityIndicator size="large" color="#06b6d4" />
          <Text style={styles.imuOverlayText}>Preparing motion data…</Text>
        </View>
      )}

      {/* Top bar — uses explicit insets so close/flash buttons are always
          below the Dynamic Island / notch / status bar on all devices. */}
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
            <View style={styles.imuBadge}>
              <Feather name="activity" size={11} color="#06b6d4" />
              <Text style={styles.imuBadgeText}>
                IMU{taskImuRequired ? " required" : ""}
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

      {/* Timer */}
      {isRecording && (
        <View style={styles.timerRow}>
          <View style={[styles.recDot, isPaused && styles.recDotPaused]} />
          <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
          {maxDuration > 0 && (
            <Text style={styles.maxText}>/ {formatTime(maxDuration)}</Text>
          )}
          {isPaused && (
            <Text style={styles.pausedLabel}>PAUSED</Text>
          )}
        </View>
      )}

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRetake}>
            <Text style={styles.retakeLink}>Retake</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom controls — paddingBottom uses insets.bottom so record button
          sits above the home indicator on all devices. */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        {/* Left: camera flip (before recording starts) */}
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

        {/* Center: record → stop button */}
        <TouchableOpacity
          style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
          onPress={isRecording ? stopRecording : () => void startRecording()}
          activeOpacity={0.8}
          disabled={imuProcessing}
        >
          {isRecording ? (
            <View style={styles.stopSquare} />
          ) : (
            <View style={styles.recordCircle} />
          )}
        </TouchableOpacity>

        {/* Right: pause / resume while recording */}
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
  imuBadgeText: { color: "#06b6d4", fontSize: 11, fontFamily: "Inter_500Medium" },
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
    backgroundColor: "rgba(0,0,0,0.75)",
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
});
