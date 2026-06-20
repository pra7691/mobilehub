import { Feather } from "@expo/vector-icons";
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  useAudioPlayer,
} from "expo-audio";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGetTask } from "@workspace/api-client-react";

import { PermissionGate } from "@/components/PermissionGate";
import { useTaskPermissions } from "@/hooks/useTaskPermissions";
import { setPendingCapture } from "@/lib/captureStore";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

type RecordingState = "idle" | "recording" | "paused" | "stopped";

export default function AudioCaptureScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data: task } = useGetTask(taskId ?? "");
  const { granted, request } = useTaskPermissions("AUDIO");

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const recordingStateRef = useRef<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const player = useAudioPlayer(recordedUri ? { uri: recordedUri } : null);
  const [isPlaying, setIsPlaying] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const minDuration = task?.minimumDurationSeconds ?? 0;
  const maxDuration = task?.maximumDurationSeconds ?? 0;

  // Sync ref for AppState listener
  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  // Stop recording when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (
        nextState !== "active" &&
        (recordingStateRef.current === "recording" ||
          recordingStateRef.current === "paused")
      ) {
        await recorder.stop();
        setRecordingState("idle");
        recordingStateRef.current = "idle";
        setElapsed(0);
      }
    });
    return () => sub.remove();
  }, [recorder]);

  // Timer with pulse animation, max-duration auto-stop
  useEffect(() => {
    if (recordingState === "recording") {
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          const next = e + 1;
          if (maxDuration > 0 && next >= maxDuration) {
            void (async () => {
              if (timerRef.current) clearInterval(timerRef.current);
              await recorder.stop();
              const uri = recorder.uri;
              if (uri) {
                setRecordedUri(uri);
                setRecordingState("stopped");
                recordingStateRef.current = "stopped";
              }
            })();
          }
          return next;
        });
      }, 1000);

      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => {
        pulse.stop();
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      pulseAnim.setValue(1);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recordingState, pulseAnim, maxDuration, recorder]);

  const startRecording = useCallback(async () => {
    const permResult = await AudioModule.requestRecordingPermissionsAsync();
    if (!permResult.granted) return;
    setError(null);
    setElapsed(0);
    setRecordedUri(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordingState("recording");
    recordingStateRef.current = "recording";
  }, [recorder]);

  const pauseRecording = useCallback(() => {
    recorder.pause();
    setRecordingState("paused");
    recordingStateRef.current = "paused";
  }, [recorder]);

  const resumeRecording = useCallback(() => {
    recorder.record();
    setRecordingState("recording");
    recordingStateRef.current = "recording";
  }, [recorder]);

  const stopRecording = useCallback(async () => {
    // Validate min duration
    if (minDuration > 0 && elapsed < minDuration) {
      setError(
        `Minimum ${minDuration} seconds required. Currently ${elapsed}s.`
      );
      return;
    }
    // Validate max duration
    if (maxDuration > 0 && elapsed > maxDuration) {
      setError(`Maximum ${maxDuration} seconds exceeded.`);
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    await recorder.stop();
    const uri = recorder.uri;
    if (uri) {
      setRecordedUri(uri);
      setRecordingState("stopped");
      recordingStateRef.current = "stopped";
    } else {
      setError("Recording failed. Please try again.");
      setRecordingState("idle");
      recordingStateRef.current = "idle";
    }
  }, [recorder, elapsed, minDuration, maxDuration]);

  const handleRerecord = useCallback(() => {
    setRecordedUri(null);
    setRecordingState("idle");
    recordingStateRef.current = "idle";
    setElapsed(0);
    setError(null);
    setIsPlaying(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  }, [player, isPlaying]);

  const handleContinue = useCallback(() => {
    if (!recordedUri) return;
    setPendingCapture({
      taskId: taskId ?? "",
      collectionType: "AUDIO",
      mediaUris: [recordedUri],
      durationSeconds: elapsed,
    });
    router.push(`/capture/review?taskId=${taskId ?? ""}`);
  }, [recordedUri, taskId, elapsed, router]);

  const handleClose = useCallback(() => {
    if (
      recordingState === "recording" ||
      recordingState === "paused"
    ) {
      Alert.alert(
        "Stop Recording?",
        "This will discard the current recording.",
        [
          { text: "Continue Recording", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: async () => {
              await recorder.stop();
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  }, [recordingState, recorder, router]);

  if (!granted) {
    return (
      <PermissionGate
        collectionType="AUDIO"
        onRetry={() => void request()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
        <Feather name="x" size={24} color="#fff" />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Audio Recording</Text>
        {task && (
          <Text style={styles.taskName} numberOfLines={1}>
            {task.title}
          </Text>
        )}

        {/* Animated indicator */}
        <View style={styles.indicatorArea}>
          {recordingState === "recording" ? (
            <Animated.View
              style={[
                styles.pulseOuter,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <View style={styles.pulseInner}>
                <Feather name="mic" size={36} color="#fff" />
              </View>
            </Animated.View>
          ) : recordingState === "stopped" ? (
            <View style={styles.pulseOuter}>
              <View style={[styles.pulseInner, styles.pulseInnerDone]}>
                <Feather name="check" size={36} color="#fff" />
              </View>
            </View>
          ) : recordingState === "paused" ? (
            <View style={[styles.pulseOuter, styles.pulseOuterPaused]}>
              <View style={[styles.pulseInner, styles.pulseInnerPaused]}>
                <Feather name="pause" size={36} color="#fff" />
              </View>
            </View>
          ) : (
            <View style={styles.pulseOuter}>
              <View style={[styles.pulseInner, styles.pulseInnerIdle]}>
                <Feather name="mic" size={36} color="#6b7280" />
              </View>
            </View>
          )}
        </View>

        {/* Timer */}
        <Text style={styles.timer}>{formatTime(elapsed)}</Text>
        {maxDuration > 0 && (
          <Text style={styles.timerMax}>max {formatTime(maxDuration)}</Text>
        )}
        {minDuration > 0 && recordingState !== "stopped" && (
          <Text style={styles.timerMin}>min {formatTime(minDuration)}</Text>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Playback (after stopping) */}
        {recordingState === "stopped" && recordedUri && (
          <View style={styles.playbackRow}>
            <TouchableOpacity style={styles.playBtn} onPress={togglePlayback}>
              <Feather
                name={isPlaying ? "pause" : "play"}
                size={22}
                color="#06b6d4"
              />
            </TouchableOpacity>
            <Text style={styles.playbackLabel}>
              {isPlaying ? "Playing…" : "Tap to preview"}
            </Text>
            <Text style={styles.playbackDuration}>{formatTime(elapsed)}</Text>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {recordingState === "idle" && (
            <TouchableOpacity style={styles.primaryBtn} onPress={startRecording}>
              <Feather name="mic" size={18} color="#0f1117" />
              <Text style={styles.primaryBtnText}>Start Recording</Text>
            </TouchableOpacity>
          )}

          {recordingState === "recording" && (
            <View style={styles.activeControls}>
              {task?.pauseAllowed !== false && (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={pauseRecording}
                >
                  <Feather name="pause" size={20} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
                <View style={styles.stopIcon} />
              </TouchableOpacity>
            </View>
          )}

          {recordingState === "paused" && (
            <View style={styles.activeControls}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={resumeRecording}
              >
                <Feather name="mic" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
                <View style={styles.stopIcon} />
              </TouchableOpacity>
            </View>
          )}

          {recordingState === "stopped" && (
            <View style={styles.doneControls}>
              <TouchableOpacity
                style={styles.rerecordBtn}
                onPress={handleRerecord}
              >
                <Feather name="rotate-ccw" size={16} color="#94a3b8" />
                <Text style={styles.rerecordText}>Re-record</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.continueBtn}
                onPress={handleContinue}
              >
                <Text style={styles.continueBtnText}>Continue</Text>
                <Feather name="arrow-right" size={16} color="#0f1117" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  closeBtn: {
    padding: 16,
    alignSelf: "flex-start",
    marginLeft: 4,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  taskName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6b7280",
    marginTop: -4,
  },
  indicatorArea: {
    marginTop: 32,
    marginBottom: 16,
  },
  pulseOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(239,68,68,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseOuterPaused: {
    backgroundColor: "rgba(245,158,11,0.15)",
  },
  pulseInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseInnerIdle: {
    backgroundColor: "#1f2937",
  },
  pulseInnerDone: {
    backgroundColor: "#22c55e",
  },
  pulseInnerPaused: {
    backgroundColor: "#f59e0b",
  },
  timer: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 2,
  },
  timerMax: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6b7280",
    marginTop: -8,
  },
  timerMin: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6b7280",
  },
  errorBanner: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#ef4444",
    width: "100%",
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  playbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#141414",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0c2033",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#164e63",
  },
  playbackLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#d1d5db",
  },
  playbackDuration: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6b7280",
  },
  controls: {
    marginTop: 24,
    width: "100%",
    alignItems: "center",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#06b6d4",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 36,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#0f1117",
  },
  activeControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  secondaryBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1f2937",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#374151",
  },
  stopBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  doneControls: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  rerecordBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#374151",
  },
  rerecordText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#94a3b8",
  },
  continueBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#06b6d4",
    borderRadius: 14,
    paddingVertical: 14,
  },
  continueBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#0f1117",
  },
});
