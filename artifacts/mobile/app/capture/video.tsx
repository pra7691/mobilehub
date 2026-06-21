import { Feather } from "@expo/vector-icons";
import { CameraView, type CameraType, type FlashMode } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetTask } from "@workspace/api-client-react";

import { PermissionGate } from "@/components/PermissionGate";
import { useTaskPermissions } from "@/hooks/useTaskPermissions";
import { setPendingCapture } from "@/lib/captureStore";

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

/**
 * Video capture state machine.
 * expo-camera CameraView does not expose pauseRecording/resumeRecording, so
 * pause/resume is implemented via segment-based recording: each pause
 * terminates the current segment, resume starts a new one. All segment URIs
 * are collected and stored in the draft together.
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

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [flash, setFlash] = useState<FlashMode>("off");
  const [facing, setFacing] = useState<CameraType>("back");
  const [error, setError] = useState<string | null>(null);

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
    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: maxDuration > 0 ? maxDuration : undefined,
      });
      if (result?.uri) {
        segmentsRef.current.push(result.uri);
        // Use camera-reported duration when available to avoid timer drift
        const nativeResult = result as typeof result & { duration?: number };
        if (typeof nativeResult.duration === "number" && nativeResult.duration > 0) {
          segmentDurationsRef.current.push(nativeResult.duration);
        }
      }
    } catch {
      // Recording cancelled or failed — no-op
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
        return;
      }
      const uris = segmentsRef.current;
      if (uris.length > 0) {
        setPendingCapture({
          taskId: taskId ?? "",
          collectionType: "VIDEO",
          mediaUris: uris,
          durationSeconds: duration,
        });
        setIsRecording(false);
        setIsPaused(false);
        setElapsed(0);
        elapsedRef.current = 0;
        segmentsRef.current = [];
        segmentDurationsRef.current = [];
        // replace (not push) so the camera screen unmounts — prevents the camera
        // preview from staying active behind the review screen.
        router.replace(`/capture/review?taskId=${taskId ?? ""}`);
      } else {
        setError("Recording failed. Please try again.");
        setIsRecording(false);
        setElapsed(0);
        elapsedRef.current = 0;
        segmentDurationsRef.current = [];
      }
    }
  }, [maxDuration, minDuration, taskId, router]);

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
        setPendingCapture({
          taskId: taskId ?? "",
          collectionType: "VIDEO",
          mediaUris: uris,
          durationSeconds: duration,
        });
        setIsRecording(false);
        setIsPaused(false);
        setElapsed(0);
        elapsedRef.current = 0;
        segmentsRef.current = [];
        segmentDurationsRef.current = [];
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
  }, [isRecording, isPaused, minDuration, taskId, router]);

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
});
