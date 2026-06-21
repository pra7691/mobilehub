import { Feather } from "@expo/vector-icons";
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  useAudioPlayer,
  setIsAudioActiveAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetTask } from "@workspace/api-client-react";

import { PermissionGate } from "@/components/PermissionGate";
import { useTaskPermissions } from "@/hooks/useTaskPermissions";
import { setPendingCapture } from "@/lib/captureStore";
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

// ─── Recorded Audio Playback ──────────────────────────────────────────────────
// Isolated component so useAudioPlayer is only ever called with a valid URI.
// Never pass null/undefined to useAudioPlayer — crashes native AudioPlayer constructor.
function RecordedAudioPlayer({
  uri,
  elapsed,
}: {
  uri: string;
  elapsed: number;
}) {
  const player = useAudioPlayer({ uri });
  const [isPlaying, setIsPlaying] = useState(false);

  const toggle = useCallback(() => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  }, [player, isPlaying]);

  return (
    <View style={styles.playbackRow}>
      <TouchableOpacity style={styles.playBtn} onPress={toggle}>
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
  );
}

// ─── Recording State ──────────────────────────────────────────────────────────
// 'preparing' — awaiting prepareToRecordAsync()
// 'recording' — actively recording
// 'paused'    — paused mid-recording
// 'stopping'  — awaiting stop() to resolve
// 'stopped'   — recording finished successfully
// 'error'     — unrecoverable error; show retry UI
// 'idle'      — initial / reset state
type RecordingState =
  | "idle"
  | "preparing"
  | "recording"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

// Module-level dedup: skip reporting the same (action, message) pair within 10 s
const _lastAudioError = { action: "", message: "", at: 0 };

function reportAudioError(
  action: string,
  err: unknown,
  meta: Record<string, unknown>
): void {
  const message =
    err instanceof Error ? err.message : String(err ?? "Unknown error");
  const now = Date.now();
  if (
    _lastAudioError.action === action &&
    _lastAudioError.message === message &&
    now - _lastAudioError.at < 10_000
  ) {
    return;
  }
  _lastAudioError.action = action;
  _lastAudioError.message = message;
  _lastAudioError.at = now;

  void reportError({
    errorType: "AUDIO_ERROR",
    message: message.slice(0, 500),
    metadata: {
      ...meta,
      action,
      platform: Platform.OS,
      timestamp: new Date(now).toISOString(),
    },
  });
}

export default function AudioCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data: task } = useGetTask(taskId ?? "");
  const { granted, request } = useTaskPermissions("AUDIO");

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const recordingStateRef = useRef<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // busyRef prevents double-invocations: any async audio operation sets it to
  // true at the start and clears it in finally. Buttons are disabled while busy.
  const busyRef = useRef(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const minDuration = task?.minimumDurationSeconds ?? 0;
  const maxDuration = task?.maximumDurationSeconds ?? 0;

  // Keep refs in sync for AppState listener and timer callbacks
  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  // Stop recording gracefully when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        nextState !== "active" &&
        (recordingStateRef.current === "recording" ||
          recordingStateRef.current === "paused")
      ) {
        // Short-circuit if another stop is already in flight
        if (busyRef.current) return;
        busyRef.current = true;
        setRecordingState("stopping");
        recordingStateRef.current = "stopping";
        void (async () => {
          try {
            await recorder.stop();
          } catch {
            // Recorder may already be stopped/released — ignore
          } finally {
            busyRef.current = false;
            setRecordingState("idle");
            recordingStateRef.current = "idle";
            setElapsed(0);
            elapsedRef.current = 0;
          }
        })();
      }
    });
    return () => sub.remove();
  }, [recorder]);

  // Timer with pulse animation and max-duration auto-stop
  useEffect(() => {
    if (recordingState === "recording") {
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          const next = e + 1;
          elapsedRef.current = next;
          if (maxDuration > 0 && next >= maxDuration) {
            if (timerRef.current) clearInterval(timerRef.current);
            // Only call stop if not already stopping or busy
            if (
              recordingStateRef.current === "recording" &&
              !busyRef.current
            ) {
              busyRef.current = true;
              setRecordingState("stopping");
              recordingStateRef.current = "stopping";
              void (async () => {
                try {
                  await recorder.stop();
                  const uri = recorder.uri;
                  if (uri) {
                    setRecordedUri(uri);
                    setRecordingState("stopped");
                    recordingStateRef.current = "stopped";
                  } else {
                    setError("Recording failed. Please try again.");
                    setRecordingState("error");
                    recordingStateRef.current = "error";
                    reportAudioError("auto-stop", new Error("No URI after stop"), {
                      screen: "audio",
                      audioState: "recording",
                      taskId: taskId ?? "",
                    });
                  }
                } catch (err) {
                  setError("Audio recording failed.");
                  setRecordingState("error");
                  recordingStateRef.current = "error";
                  reportAudioError("auto-stop", err, {
                    screen: "audio",
                    audioState: "recording",
                    taskId: taskId ?? "",
                  });
                } finally {
                  busyRef.current = false;
                }
              })();
            }
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
  }, [recordingState, pulseAnim, maxDuration, recorder, taskId]);

  const startRecording = useCallback(async () => {
    // Latch busyRef immediately — before any await — so a rapid second tap
    // is rejected even while the permission or storage preflight is in flight.
    if (busyRef.current) return;
    if (recordingState !== "idle" && recordingState !== "error") return;
    busyRef.current = true;

    try {
      const permResult = await AudioModule.requestRecordingPermissionsAsync();
      if (!permResult.granted) {
        busyRef.current = false;
        return;
      }

      const hasSpace = await hasSufficientStorage();
      if (!hasSpace) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Low Storage",
            "Your device has less than 200 MB of free space. Recording may fail or be cut short.",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Record Anyway", onPress: () => resolve(true) },
            ]
          );
        });
        if (!confirmed) {
          busyRef.current = false;
          return;
        }
      }

      setError(null);
      setElapsed(0);
      elapsedRef.current = 0;
      setRecordedUri(null);
      setRecordingState("preparing");
      recordingStateRef.current = "preparing";

      await setIsAudioActiveAsync(true);
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingState("recording");
      recordingStateRef.current = "recording";
    } catch (err) {
      setError("Audio recording failed. Please try again.");
      setRecordingState("error");
      recordingStateRef.current = "error";
      reportAudioError("start", err, {
        screen: "audio",
        audioState: "preparing",
        taskId: taskId ?? "",
      });
    } finally {
      busyRef.current = false;
    }
  }, [recorder, recordingState, taskId]);

  const pauseRecording = useCallback(() => {
    if (busyRef.current) return;
    if (recordingState !== "recording") return;
    try {
      recorder.pause();
      setRecordingState("paused");
      recordingStateRef.current = "paused";
    } catch (err) {
      setError("Audio recording failed. Please try again.");
      setRecordingState("error");
      recordingStateRef.current = "error";
      reportAudioError("pause", err, {
        screen: "audio",
        audioState: "recording",
        taskId: taskId ?? "",
      });
    }
  }, [recorder, recordingState, taskId]);

  const resumeRecording = useCallback(() => {
    if (busyRef.current) return;
    if (recordingState !== "paused") return;
    try {
      recorder.record();
      setRecordingState("recording");
      recordingStateRef.current = "recording";
    } catch (err) {
      setError("Audio recording failed. Please try again.");
      setRecordingState("error");
      recordingStateRef.current = "error";
      reportAudioError("resume", err, {
        screen: "audio",
        audioState: "paused",
        taskId: taskId ?? "",
      });
    }
  }, [recorder, recordingState, taskId]);

  const stopRecording = useCallback(async () => {
    if (busyRef.current) return;
    if (
      recordingState !== "recording" &&
      recordingState !== "paused"
    ) return;

    if (minDuration > 0 && elapsedRef.current < minDuration) {
      setError(
        `Minimum ${minDuration} seconds required. Currently ${elapsedRef.current}s.`
      );
      return;
    }
    if (maxDuration > 0 && elapsedRef.current > maxDuration) {
      setError(`Maximum ${maxDuration} seconds exceeded.`);
      return;
    }

    busyRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);

    const prevState = recordingState;
    setRecordingState("stopping");
    recordingStateRef.current = "stopping";

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        setRecordedUri(uri);
        setRecordingState("stopped");
        recordingStateRef.current = "stopped";
      } else {
        setError("Recording failed. Please try again.");
        setRecordingState("error");
        recordingStateRef.current = "error";
        void setIsAudioActiveAsync(false).catch(() => {});
        reportAudioError("stop", new Error("No URI returned after stop"), {
          screen: "audio",
          audioState: prevState,
          taskId: taskId ?? "",
        });
      }
    } catch (err) {
      setError("Audio recording failed. Please try again.");
      setRecordingState("error");
      recordingStateRef.current = "error";
      void setIsAudioActiveAsync(false).catch(() => {});
      reportAudioError("stop", err, {
        screen: "audio",
        audioState: prevState,
        taskId: taskId ?? "",
      });
    } finally {
      busyRef.current = false;
    }
  }, [recorder, recordingState, elapsed, minDuration, maxDuration, taskId]);

  const handleRerecord = useCallback(() => {
    setRecordedUri(null);
    setRecordingState("idle");
    recordingStateRef.current = "idle";
    setElapsed(0);
    elapsedRef.current = 0;
    setError(null);
  }, []);

  const handleContinue = useCallback(() => {
    if (!recordedUri) return;
    setPendingCapture({
      taskId: taskId ?? "",
      collectionType: "AUDIO",
      mediaUris: [recordedUri],
      durationSeconds: elapsed,
    });
    // replace (not push) so the audio screen is removed from the stack
    router.replace(`/capture/review?taskId=${taskId ?? ""}`);
  }, [recordedUri, taskId, elapsed, router]);

  const handleClose = useCallback(() => {
    const state = recordingStateRef.current;

    // Block close entirely while an async audio operation is in flight.
    // Navigating away during preparing/stopping would orphan the in-progress
    // recorder.prepareToRecordAsync() or recorder.stop() call.
    if (state === "preparing" || state === "stopping" || busyRef.current) {
      return;
    }

    if (state === "recording" || state === "paused") {
      Alert.alert(
        "Stop Recording?",
        "This will discard the current recording.",
        [
          { text: "Continue Recording", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: async () => {
              // Re-check after Alert completes — state may have changed
              if (busyRef.current || recordingStateRef.current === "stopping") {
                router.back();
                return;
              }
              busyRef.current = true;
              setRecordingState("stopping");
              recordingStateRef.current = "stopping";
              try {
                await recorder.stop();
              } catch {
                // Ignore — we're discarding anyway
              } finally {
                busyRef.current = false;
              }
              router.back();
            },
          },
        ]
      );
    } else {
      router.back();
    }
  }, [recorder, router]);

  const isBusy =
    busyRef.current ||
    recordingState === "preparing" ||
    recordingState === "stopping";

  if (!granted) {
    return (
      <PermissionGate
        collectionType="AUDIO"
        onRetry={() => void request()}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Close button — paddingTop derived from safe-area insets so it always
          clears the Dynamic Island / notch / status bar on all devices. */}
      <TouchableOpacity
        style={[styles.closeBtn, { marginTop: insets.top + 4 }]}
        onPress={handleClose}
      >
        <Feather name="x" size={24} color="#fff" />
      </TouchableOpacity>

      <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
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
          ) : recordingState === "error" ? (
            <View style={[styles.pulseOuter, styles.pulseOuterError]}>
              <View style={[styles.pulseInner, styles.pulseInnerError]}>
                <Feather name="alert-triangle" size={36} color="#fff" />
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

        {/* Transition label */}
        {(recordingState === "preparing" || recordingState === "stopping") && (
          <Text style={styles.transitionLabel}>
            {recordingState === "preparing" ? "Preparing…" : "Stopping…"}
          </Text>
        )}

        {/* Error — shown for duration validation errors and hardware errors */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Error recovery UI — shown when state machine is in 'error' */}
        {recordingState === "error" && (
          <View style={styles.errorControls}>
            <Text style={styles.errorTitle}>Audio recording failed</Text>
            <Text style={styles.errorBody}>
              Please try recording again.
            </Text>
            <View style={styles.errorActions}>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={handleRerecord}
              >
                <Feather name="rotate-ccw" size={16} color="#0f1117" />
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => router.back()}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Playback — only mounted when a valid URI exists to prevent
            useAudioPlayer from receiving null (crashes native constructor) */}
        {recordingState === "stopped" && recordedUri && (
          <RecordedAudioPlayer uri={recordedUri} elapsed={elapsed} />
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {(recordingState === "idle") && (
            <TouchableOpacity
              style={[styles.primaryBtn, isBusy && styles.btnDisabled]}
              onPress={() => void startRecording()}
              disabled={isBusy}
            >
              <Feather name="mic" size={18} color="#0f1117" />
              <Text style={styles.primaryBtnText}>Start Recording</Text>
            </TouchableOpacity>
          )}

          {recordingState === "recording" && (
            <View style={styles.activeControls}>
              {task?.pauseAllowed !== false && (
                <TouchableOpacity
                  style={[styles.secondaryBtn, isBusy && styles.btnDisabled]}
                  onPress={pauseRecording}
                  disabled={isBusy}
                >
                  <Feather name="pause" size={20} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.stopBtn, isBusy && styles.stopBtnDisabled]}
                onPress={() => void stopRecording()}
                disabled={isBusy}
              >
                <View style={styles.stopIcon} />
              </TouchableOpacity>
            </View>
          )}

          {recordingState === "paused" && (
            <View style={styles.activeControls}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isBusy && styles.btnDisabled]}
                onPress={resumeRecording}
                disabled={isBusy}
              >
                <Feather name="mic" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stopBtn, isBusy && styles.stopBtnDisabled]}
                onPress={() => void stopRecording()}
                disabled={isBusy}
              >
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  closeBtn: {
    padding: 16,
    alignSelf: "flex-start",
    marginLeft: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
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
  pulseOuterError: {
    backgroundColor: "rgba(239,68,68,0.2)",
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
  pulseInnerError: {
    backgroundColor: "#dc2626",
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
  transitionLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#9ca3af",
    fontStyle: "italic",
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
  errorControls: {
    width: "100%",
    backgroundColor: "#140a0a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  errorTitle: {
    color: "#fca5a5",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  errorBody: {
    color: "#9ca3af",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  errorActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    width: "100%",
  },
  retryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#06b6d4",
    borderRadius: 12,
    paddingVertical: 12,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#0f1117",
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#94a3b8",
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
  stopBtnDisabled: {
    borderColor: "#4b5563",
    opacity: 0.5,
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
  btnDisabled: {
    opacity: 0.4,
  },
});
