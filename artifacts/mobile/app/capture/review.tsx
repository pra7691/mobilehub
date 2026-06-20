import { Feather } from "@expo/vector-icons";
import { useAudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useGetTask, getListSubmissionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { useDrafts } from "@/contexts/DraftContext";
import { copyMediaToDrafts, generateDraftId, getDraft } from "@/lib/drafts";
import { submitDraft, type SubmitProgress } from "@/lib/submitDraft";
import {
  clearPendingCapture,
  getPendingCapture,
  setPendingCapture,
  type PendingCapture,
} from "@/lib/captureStore";

const MIN_FREE_BYTES_TO_SAVE = 50 * 1024 * 1024; // 50 MB

const TYPE_ICON: Record<string, string> = {
  VIDEO: "🎥",
  IMAGE: "📷",
  AUDIO: "🎙️",
};

export default function ReviewScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { taskId, draftId } = useLocalSearchParams<{
    taskId: string;
    draftId?: string;
  }>();
  const { data: task } = useGetTask(taskId ?? "");
  const { saveDraft, deleteDraft } = useDrafts();

  const [captureData, setCaptureData] = useState<PendingCapture | null>(
    getPendingCapture()
  );
  const [loadingDraft, setLoadingDraft] = useState(!captureData && !!draftId);

  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<SubmitProgress | null>(null);
  const [submittedToast, setSubmittedToast] = useState(false);
  const [currentImage, setCurrentImage] = useState(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(draftId);

  useEffect(() => {
    if (captureData || !draftId) return;
    setLoadingDraft(true);
    getDraft(draftId).then((draft) => {
      if (draft) {
        const data: PendingCapture = {
          taskId: draft.taskId,
          collectionType: draft.collectionType,
          mediaUris: draft.mediaUris,
          durationSeconds: draft.durationSeconds,
        };
        setPendingCapture(data);
        setCaptureData(data);
        setIsDraftMode(true);
        setCurrentDraftId(draftId);
      }
      setLoadingDraft(false);
    });
  }, [draftId, captureData]);

  const audioUri =
    captureData?.collectionType === "AUDIO"
      ? captureData.mediaUris[0] ?? null
      : null;
  const player = useAudioPlayer(audioUri ? { uri: audioUri } : null);

  const videoRef = useRef<Video>(null);

  useEffect(() => {
    return () => {
      if (!isDraftMode) clearPendingCapture();
    };
  }, [isDraftMode]);

  const handleRetake = useCallback(() => {
    clearPendingCapture();
    router.back();
  }, [router]);

  const handleSaveDraft = useCallback(async () => {
    if (!captureData || !task) {
      Alert.alert("Error", "Missing capture data. Please retake.");
      return;
    }
    if (isDraftMode) {
      router.replace("/(tabs)/submissions?tab=drafts");
      return;
    }
    setSaving(true);
    try {
      const freeDisk = await FileSystem.getFreeDiskStorageAsync();
      if (freeDisk < MIN_FREE_BYTES_TO_SAVE) {
        Alert.alert(
          "Storage Almost Full",
          "You don't have enough free space to save this draft. Please free up storage on your device and try again.",
          [{ text: "OK" }]
        );
        setSaving(false);
        return;
      }

      const ext =
        captureData.collectionType === "VIDEO"
          ? "mp4"
          : captureData.collectionType === "AUDIO"
          ? "m4a"
          : "jpg";

      const newDraftId = currentDraftId ?? generateDraftId();
      const savedUris: string[] = [];
      for (let i = 0; i < captureData.mediaUris.length; i++) {
        const filename = `${newDraftId}_${i}.${ext}`;
        const destUri = await copyMediaToDrafts(captureData.mediaUris[i]!, filename);
        savedUris.push(destUri);
      }

      await saveDraft({
        id: newDraftId,
        taskId: captureData.taskId,
        taskTitle: task.title,
        collectionType: captureData.collectionType,
        paymentAmount: task.paymentAmount,
        currency: task.currency ?? "INR",
        mediaUris: savedUris,
        durationSeconds: captureData.durationSeconds,
        imageCount:
          captureData.collectionType === "IMAGE"
            ? savedUris.length
            : undefined,
        createdAt: new Date().toISOString(),
        status: "ready_to_upload",
      });

      clearPendingCapture();
      setSavedToast(true);
      setTimeout(() => {
        router.replace("/(tabs)/submissions?tab=drafts");
      }, 1200);
    } catch {
      Alert.alert("Save failed", "Could not save draft. Please try again.");
    }
    setSaving(false);
  }, [captureData, task, saveDraft, router, currentDraftId, isDraftMode]);

  const handleSubmit = useCallback(async () => {
    if (!captureData || !task) {
      Alert.alert("Error", "Missing capture data. Please retake.");
      return;
    }

    setSubmitting(true);
    setSubmitProgress({ phase: "uploading", current: 0, total: captureData.mediaUris.length });

    try {
      if (isDraftMode && currentDraftId) {
        const draft = await getDraft(currentDraftId);
        if (!draft) throw new Error("Draft not found");
        await submitDraft(draft, setSubmitProgress);
        await deleteDraft(currentDraftId);
      } else {
        const ext =
          captureData.collectionType === "VIDEO"
            ? "mp4"
            : captureData.collectionType === "AUDIO"
            ? "m4a"
            : "jpg";
        const tempDraftId = generateDraftId();
        const tempDraft = {
          id: tempDraftId,
          taskId: captureData.taskId,
          taskTitle: task.title,
          collectionType: captureData.collectionType,
          paymentAmount: task.paymentAmount,
          currency: task.currency ?? "INR",
          mediaUris: captureData.mediaUris,
          durationSeconds: captureData.durationSeconds,
          imageCount:
            captureData.collectionType === "IMAGE"
              ? captureData.mediaUris.length
              : undefined,
          createdAt: new Date().toISOString(),
          status: "ready_to_upload" as const,
        };
        await submitDraft(tempDraft, setSubmitProgress);
        clearPendingCapture();
      }

      await queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey() });

      setSubmittedToast(true);
      setSubmitting(false);
      setSubmitProgress(null);
      setTimeout(() => {
        router.replace("/(tabs)/submissions?tab=under_review");
      }, 1400);
    } catch (err) {
      setSubmitting(false);
      setSubmitProgress(null);
      const message =
        err instanceof Error ? err.message : "Unknown error occurred";
      Alert.alert("Submission Failed", message, [{ text: "OK" }]);
    }
  }, [captureData, task, isDraftMode, currentDraftId, deleteDraft, queryClient, router]);

  if (loadingDraft) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color="#06b6d4" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!captureData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorMsg}>No capture data found.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {savedToast && (
        <View style={styles.toast}>
          <Feather name="check-circle" size={18} color="#22c55e" />
          <Text style={styles.toastText}>Draft saved!</Text>
        </View>
      )}
      {submittedToast && (
        <View style={[styles.toast, styles.toastSubmit]}>
          <Feather name="send" size={18} color="#8b5cf6" />
          <Text style={[styles.toastText, { color: "#8b5cf6" }]}>Submitted for review!</Text>
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={handleRetake} style={styles.retakeBtn}>
          <Feather name="arrow-left" size={20} color="#06b6d4" />
          <Text style={styles.retakeBtnText}>
            {isDraftMode ? "Back" : "Retake"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.preview}>
          {captureData.collectionType === "VIDEO" && captureData.mediaUris[0] && (
            <Video
              ref={videoRef}
              source={{ uri: captureData.mediaUris[0] }}
              style={styles.videoPlayer}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          )}

          {captureData.collectionType === "IMAGE" && (
            <View>
              {captureData.mediaUris[currentImage] ? (
                <Image
                  source={{ uri: captureData.mediaUris[currentImage] }}
                  style={styles.imagePreview}
                  contentFit="contain"
                />
              ) : null}
              {captureData.mediaUris.length > 1 && (
                <View style={styles.imagePager}>
                  <TouchableOpacity
                    disabled={currentImage === 0}
                    onPress={() => setCurrentImage((i) => Math.max(0, i - 1))}
                  >
                    <Feather
                      name="chevron-left"
                      size={24}
                      color={currentImage === 0 ? "#374151" : "#06b6d4"}
                    />
                  </TouchableOpacity>
                  <Text style={styles.pagerText}>
                    {currentImage + 1} / {captureData.mediaUris.length}
                  </Text>
                  <TouchableOpacity
                    disabled={currentImage === captureData.mediaUris.length - 1}
                    onPress={() =>
                      setCurrentImage((i) =>
                        Math.min(captureData.mediaUris.length - 1, i + 1)
                      )
                    }
                  >
                    <Feather
                      name="chevron-right"
                      size={24}
                      color={
                        currentImage === captureData.mediaUris.length - 1
                          ? "#374151"
                          : "#06b6d4"
                      }
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {captureData.collectionType === "AUDIO" && (
            <View style={styles.audioPreview}>
              <View style={styles.audioIconCircle}>
                <Feather name="mic" size={40} color="#06b6d4" />
              </View>
              <TouchableOpacity
                style={styles.playAudioBtn}
                onPress={() => {
                  if (!player) return;
                  if (audioPlaying) {
                    player.pause();
                    setAudioPlaying(false);
                  } else {
                    player.play();
                    setAudioPlaying(true);
                  }
                }}
              >
                <Feather
                  name={audioPlaying ? "pause" : "play"}
                  size={24}
                  color="#0f1117"
                />
                <Text style={styles.playAudioBtnText}>
                  {audioPlaying ? "Pause Preview" : "Play Preview"}
                </Text>
              </TouchableOpacity>
              {captureData.durationSeconds != null && (
                <Text style={styles.audioDuration}>
                  Duration:{" "}
                  {Math.floor(captureData.durationSeconds / 60)}:
                  {(captureData.durationSeconds % 60)
                    .toString()
                    .padStart(2, "0")}
                </Text>
              )}
            </View>
          )}
        </View>

        {task && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Task Requirements</Text>
            <Text style={styles.summaryTitle}>
              {TYPE_ICON[captureData.collectionType]} {task.title}
            </Text>

            {captureData.collectionType !== "IMAGE" && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Duration Range</Text>
                <Text style={styles.summaryVal}>
                  {task.minimumDurationSeconds ?? 0}s –{" "}
                  {task.maximumDurationSeconds ?? "∞"}s
                </Text>
              </View>
            )}
            {captureData.collectionType === "IMAGE" && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Photos Required</Text>
                <Text style={styles.summaryVal}>
                  {task.minimumImageCount ?? 1} – {task.maximumImageCount ?? "∞"}
                </Text>
              </View>
            )}
            {captureData.collectionType === "IMAGE" && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Photos Captured</Text>
                <Text style={[styles.summaryVal, { color: "#22c55e" }]}>
                  {captureData.mediaUris.length}
                </Text>
              </View>
            )}
            {captureData.durationSeconds != null &&
              captureData.collectionType !== "IMAGE" && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Recorded Duration</Text>
                  <Text style={[styles.summaryVal, { color: "#22c55e" }]}>
                    {captureData.durationSeconds}s
                  </Text>
                </View>
              )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Payout</Text>
              <Text style={[styles.summaryVal, { color: "#06b6d4" }]}>
                ₹{task.paymentAmount} {task.currency}
              </Text>
            </View>
          </View>
        )}

        {/* Progress indicator during submission */}
        {submitting && submitProgress && (
          <View style={styles.progressCard}>
            <ActivityIndicator color="#8b5cf6" size="small" />
            <View style={styles.progressText}>
              {submitProgress.phase === "uploading" ? (
                <Text style={styles.progressLabel}>
                  Uploading {submitProgress.current} of {submitProgress.total}…
                </Text>
              ) : (
                <Text style={styles.progressLabel}>Submitting for review…</Text>
              )}
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round(
                        (submitProgress.current / Math.max(submitProgress.total, 1)) * 100
                      )}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          {/* Submit button */}
          <TouchableOpacity
            style={[styles.submitBtn, (submitting || saving) && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || saving}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Submit for Review</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Save draft button */}
          <TouchableOpacity
            style={[styles.saveDraftBtn, (submitting || saving) && styles.btnDisabled]}
            onPress={handleSaveDraft}
            disabled={submitting || saving}
          >
            {saving ? (
              <ActivityIndicator color="#0f1117" size="small" />
            ) : (
              <>
                <Feather name="save" size={18} color="#0f1117" />
                <Text style={styles.saveDraftBtnText}>
                  {isDraftMode ? "Close Draft" : "Save Draft"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  errorMsg: { color: "#9ca3af", fontSize: 16, fontFamily: "Inter_400Regular" },
  backBtn: {
    backgroundColor: "#164e63",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  backBtnText: { color: "#06b6d4", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  toast: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#141414",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  toastSubmit: { borderColor: "#8b5cf6" },
  toastText: { color: "#22c55e", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#141414",
  },
  retakeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 80,
  },
  retakeBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#06b6d4",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  preview: {
    margin: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#141414",
    minHeight: 240,
  },
  videoPlayer: { width: "100%", height: 260 },
  imagePreview: { width: "100%", height: 300 },
  imagePager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 12,
    backgroundColor: "#1a1a1a",
  },
  pagerText: { color: "#9ca3af", fontSize: 14, fontFamily: "Inter_500Medium" },

  audioPreview: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 20,
  },
  audioIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#0c2033",
    borderWidth: 1,
    borderColor: "#164e63",
    alignItems: "center",
    justifyContent: "center",
  },
  playAudioBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#06b6d4",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  playAudioBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#0f1117",
  },
  audioDuration: {
    color: "#6b7280",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#141414",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
    gap: 10,
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#4b5563",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryKey: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6b7280" },
  summaryVal: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  progressCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#0e0826",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#4c1d95",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  progressText: { flex: 1, gap: 8 },
  progressLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#a78bfa",
  },
  progressBar: {
    height: 4,
    backgroundColor: "#1e1b4b",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#8b5cf6",
    borderRadius: 2,
  },

  actions: {
    marginHorizontal: 16,
    marginTop: 4,
    gap: 10,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#7c3aed",
    borderRadius: 14,
    paddingVertical: 16,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  saveDraftBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#06b6d4",
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveDraftBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#0f1117",
  },
  btnDisabled: { opacity: 0.5 },
});
