import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  useListMySubmissions,
  getListMySubmissionsQueryKey,
} from "@workspace/api-client-react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";
import { useDrafts } from "@/contexts/DraftContext";
import type { LocalDraft } from "@/lib/drafts";
import { submitDraft, type SubmitProgress } from "@/lib/submitDraft";

type SubmissionStatus =
  | "DRAFT"
  | "UPLOADING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "RESUBMISSION_REQUIRED"
  | "UPLOAD_FAILED";

interface Submission {
  id: string;
  status: SubmissionStatus;
  paymentAmountSnapshot: number;
  currencySnapshot: string;
  collectionType: string;
  createdAt: string;
  taskId?: string | null;
  task?: { title: string; collectionType?: string } | null;
  taskSnapshot?: { title?: string; collectionType?: string };
  rejectionReason?: string | null;
  resubmissionReason?: string | null;
  approvedAmount?: number | null;
  adminNote?: string | null;
  reviewedAt?: string | null;
}

const SUBMISSION_STATUS_CONFIG: Record<
  SubmissionStatus,
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: "Draft", color: "#94a3b8", bg: "#1e293b" },
  UPLOADING: { label: "Uploading", color: "#06b6d4", bg: "#0c2033" },
  UNDER_REVIEW: { label: "Under Review", color: "#8b5cf6", bg: "#2e1065" },
  APPROVED: { label: "Approved", color: "#22c55e", bg: "#052e16" },
  REJECTED: { label: "Rejected", color: "#ef4444", bg: "#450a0a" },
  RESUBMISSION_REQUIRED: {
    label: "Resubmit",
    color: "#f59e0b",
    bg: "#422006",
  },
  UPLOAD_FAILED: { label: "Upload Failed", color: "#f87171", bg: "#3b0a0a" },
};

const COLLECTION_TYPE_ICON: Record<string, string> = {
  VIDEO: "🎥",
  IMAGE: "📷",
  AUDIO: "🎙️",
};

type TabId = "drafts" | "needs_action" | "under_review" | "completed";

const TABS: { id: TabId; label: string }[] = [
  { id: "drafts", label: "Drafts" },
  { id: "needs_action", label: "Needs Action" },
  { id: "under_review", label: "Under Review" },
  { id: "completed", label: "Completed" },
];

export default function SubmissionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam === "drafts"
      ? "drafts"
      : tabParam === "needs_action"
        ? "needs_action"
        : tabParam === "completed"
          ? "completed"
          : "under_review"
  );

  useEffect(() => {
    if (tabParam === "drafts") setActiveTab("drafts");
    else if (tabParam === "needs_action") setActiveTab("needs_action");
    else if (tabParam === "completed") setActiveTab("completed");
    else if (tabParam === "under_review") setActiveTab("under_review");
  }, [tabParam]);

  const [refreshing, setRefreshing] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitProgress, setSubmitProgress] = useState<SubmitProgress | null>(
    null
  );

  const { data, isLoading } = useListMySubmissions();
  const submissions: Submission[] =
    (data as { data?: Submission[] } | undefined)?.data ?? [];

  const { drafts, deleteDraft } = useDrafts();

  const needsAction = submissions.filter((s) =>
    (["RESUBMISSION_REQUIRED"] as SubmissionStatus[]).includes(s.status)
  );
  const underReview = submissions.filter((s) =>
    (["UPLOADING", "UNDER_REVIEW"] as SubmissionStatus[]).includes(s.status)
  );
  const completed = submissions.filter((s) =>
    (["APPROVED", "REJECTED", "UPLOAD_FAILED"] as SubmissionStatus[]).includes(s.status)
  );

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({
      queryKey: getListMySubmissionsQueryKey(),
    });
    setRefreshing(false);
  }

  function confirmDeleteDraft(draft: LocalDraft) {
    Alert.alert(
      "Delete Draft?",
      `This will permanently remove the draft "${draft.taskTitle}" and its local media files.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteDraft(draft.id),
        },
      ]
    );
  }

  async function handleSubmitDraft(draft: LocalDraft) {
    setSubmittingId(draft.id);
    setSubmitProgress({
      phase: "preparing",
      current: 0,
      total: draft.mediaUris.length,
    });
    try {
      await submitDraft(draft, (progress) => {
        setSubmitProgress(progress);
      });
      await deleteDraft(draft.id);
      await queryClient.invalidateQueries({
        queryKey: getListMySubmissionsQueryKey(),
      });
      setSubmittingId(null);
      setSubmitProgress(null);
      setActiveTab("under_review");
    } catch (err) {
      setSubmittingId(null);
      setSubmitProgress(null);
      const message =
        err instanceof Error ? err.message : "Unknown error occurred";
      Alert.alert("Submission Failed", message, [{ text: "OK" }]);
    }
  }

  function confirmSubmitDraft(draft: LocalDraft) {
    const mediaCount = draft.mediaUris.length;
    const typeLabel =
      draft.collectionType === "IMAGE"
        ? `${mediaCount} photo${mediaCount !== 1 ? "s" : ""}`
        : draft.collectionType === "VIDEO"
          ? "video"
          : "audio recording";

    Alert.alert(
      "Submit for Review?",
      `Upload ${typeLabel} for "${draft.taskTitle}" and send it for admin review. You'll earn ₹${draft.paymentAmount} upon approval.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: () => void handleSubmitDraft(draft),
        },
      ]
    );
  }

  const styles = makeStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>History</Text>
          <Text style={styles.headerTitle}>My Uploads</Text>
        </View>
      </View>

      {/* Segmented control */}
      <View style={styles.segmented}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.segmentBtn,
              activeTab === tab.id && styles.segmentBtnActive,
            ]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                activeTab === tab.id && styles.segmentTextActive,
              ]}
            >
              {tab.label}
            </Text>
            {tab.id === "drafts" && drafts.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{drafts.length}</Text>
              </View>
            )}
            {tab.id === "needs_action" && needsAction.length > 0 && (
              <View style={[styles.badge, { backgroundColor: "#b45309" }]}>
                <Text style={styles.badgeText}>{needsAction.length}</Text>
              </View>
            )}
            {tab.id === "under_review" && underReview.length > 0 && (
              <View style={[styles.badge, styles.badgePurple]}>
                <Text style={styles.badgeText}>{underReview.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Drafts tab */}
      {activeTab === "drafts" && (
        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const date = new Date(item.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            });
            const isSubmitting = submittingId === item.id;
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.75}
                onPress={() =>
                  !isSubmitting &&
                  router.push(
                    `/capture/review?taskId=${item.taskId}&draftId=${item.id}`
                  )
                }
                onLongPress={() => !isSubmitting && confirmDeleteDraft(item)}
                disabled={isSubmitting}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {COLLECTION_TYPE_ICON[item.collectionType] ?? "📁"}{" "}
                    {item.taskTitle}
                  </Text>
                  <View style={styles.readyBadge}>
                    <Text style={styles.readyBadgeText}>Ready to Upload</Text>
                  </View>
                </View>

                {/* Upload progress */}
                {isSubmitting && submitProgress && (
                  <View style={styles.uploadProgress}>
                    <ActivityIndicator color="#8b5cf6" size="small" />
                    <View style={styles.uploadProgressText}>
                      <Text style={styles.uploadProgressLabel}>
                        {submitProgress.phase === "preparing"
                          ? "Preparing…"
                          : submitProgress.phase === "uploading"
                            ? `Uploading ${submitProgress.current} of ${submitProgress.total}…`
                            : "Finalising…"}
                      </Text>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.round(
                                (submitProgress.current /
                                  Math.max(submitProgress.total, 1)) *
                                  100
                              )}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                )}

                <View style={styles.cardBottom}>
                  <View style={styles.dateRow}>
                    <Feather
                      name="calendar"
                      size={12}
                      color={colors.mutedForeground}
                    />
                    <Text style={styles.dateText}>{date}</Text>
                  </View>
                  <View style={styles.typeRow}>
                    <Text style={styles.typeText}>{item.collectionType}</Text>
                  </View>
                  <View style={styles.payoutRow}>
                    <Feather name="trending-up" size={12} color={colors.primary} />
                    <Text style={styles.payoutText}>₹{item.paymentAmount}</Text>
                  </View>
                  {!isSubmitting && (
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.submitCardBtn}
                        onPress={() => confirmSubmitDraft(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="send" size={14} color="#fff" />
                        <Text style={styles.submitCardBtnText}>Submit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => confirmDeleteDraft(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="trash-2" size={14} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="inbox" size={40} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>No drafts yet</Text>
              <Text style={styles.emptySubtext}>
                Start a task to capture and save a draft
              </Text>
            </View>
          }
        />
      )}

      {/* Needs Action tab */}
      {activeTab === "needs_action" && (
        <FlatList
          data={needsAction}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <SubmissionCard item={item} styles={styles} colors={colors} />
          )}
          ListHeaderComponent={
            isLoading ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <Feather
                  name="alert-circle"
                  size={40}
                  color={colors.mutedForeground}
                />
                <Text style={styles.emptyText}>No action needed</Text>
                <Text style={styles.emptySubtext}>
                  Submissions requiring resubmission appear here
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Under Review tab */}
      {activeTab === "under_review" && (
        <FlatList
          data={underReview}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <SubmissionCard item={item} styles={styles} colors={colors} />
          )}
          ListHeaderComponent={
            isLoading ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <Feather
                  name="clock"
                  size={40}
                  color={colors.mutedForeground}
                />
                <Text style={styles.emptyText}>Nothing under review</Text>
                <Text style={styles.emptySubtext}>
                  Uploaded submissions appear here
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Completed tab */}
      {activeTab === "completed" && (
        <FlatList
          data={completed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <SubmissionCard item={item} styles={styles} colors={colors} />
          )}
          ListHeaderComponent={
            isLoading ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <Feather
                  name="check-circle"
                  size={40}
                  color={colors.mutedForeground}
                />
                <Text style={styles.emptyText}>No completed submissions</Text>
                <Text style={styles.emptySubtext}>
                  Approved and rejected submissions appear here
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function getTaskTitle(item: Submission): string {
  return (
    (item.taskSnapshot as { title?: string } | undefined)?.title ??
    item.task?.title ??
    "Task"
  );
}

function getCollectionType(item: Submission): string {
  return item.collectionType ?? item.task?.collectionType ?? "";
}

function SubmissionCard({
  item,
  styles,
  colors,
}: {
  item: Submission;
  styles: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();
  const config =
    SUBMISSION_STATUS_CONFIG[item.status] ??
    SUBMISSION_STATUS_CONFIG["UNDER_REVIEW"];
  const date = new Date(item.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const collType = getCollectionType(item);
  const title = getTaskTitle(item);
  return (
    <View style={styles.card} testID={`card-submission-${item.id}`}>
      <View style={styles.cardTop}>
        <Text style={styles.taskTitle} numberOfLines={1}>
          {collType ? (COLLECTION_TYPE_ICON[collType] ?? "") + " " : ""}
          {title}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
          <Text style={[styles.statusText, { color: config.color }]}>
            {config.label}
          </Text>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.dateRow}>
          <Feather name="calendar" size={12} color={colors.mutedForeground} />
          <Text style={styles.dateText}>{date}</Text>
        </View>
        {item.status === "APPROVED" && (
          <View style={styles.payoutRow}>
            <Feather name="trending-up" size={12} color={colors.success} />
            <Text style={[styles.payoutText, { color: colors.success }]}>
              ₹{item.approvedAmount ?? item.paymentAmountSnapshot} earned
            </Text>
          </View>
        )}
        {item.status === "APPROVED" && item.reviewedAt && (
          <View style={styles.dateRow}>
            <Feather name="check" size={11} color={colors.mutedForeground} />
            <Text style={styles.dateText}>
              {new Date(item.reviewedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </Text>
          </View>
        )}
        {item.status === "UPLOAD_FAILED" && (
          <View style={styles.retryHint}>
            <Feather name="refresh-cw" size={11} color="#f87171" />
            <Text style={styles.retryHintText}>Go to Drafts to retry</Text>
          </View>
        )}
      </View>
      {item.status === "REJECTED" && item.rejectionReason ? (
        <View style={styles.reasonBox}>
          <Feather name="x-circle" size={12} color="#ef4444" />
          <Text style={styles.reasonText} numberOfLines={3}>{item.rejectionReason}</Text>
        </View>
      ) : null}
      {item.status === "REJECTED" && item.adminNote ? (
        <View style={[styles.reasonBox, { backgroundColor: "#1a1a2e", borderColor: "#2a2a4a" }]}>
          <Feather name="info" size={12} color="#94a3b8" />
          <Text style={[styles.reasonText, { color: "#94a3b8" }]} numberOfLines={2}>{item.adminNote}</Text>
        </View>
      ) : null}
      {item.status === "RESUBMISSION_REQUIRED" && item.resubmissionReason ? (
        <View style={styles.reasonBox}>
          <Feather name="alert-circle" size={12} color="#f59e0b" />
          <Text style={[styles.reasonText, { color: "#f59e0b" }]} numberOfLines={3}>{item.resubmissionReason}</Text>
        </View>
      ) : null}
      {item.status === "RESUBMISSION_REQUIRED" && item.adminNote ? (
        <View style={[styles.reasonBox, { backgroundColor: "#1a1a2e", borderColor: "#2a2a4a" }]}>
          <Feather name="info" size={12} color="#94a3b8" />
          <Text style={[styles.reasonText, { color: "#94a3b8" }]} numberOfLines={2}>{item.adminNote}</Text>
        </View>
      ) : null}
      {item.status === "RESUBMISSION_REQUIRED" && item.taskId ? (
        <TouchableOpacity
          style={styles.resubmitCta}
          activeOpacity={0.8}
          onPress={() => router.push(`/task/${item.taskId}`)}
        >
          <Feather name="refresh-cw" size={13} color="#f59e0b" />
          <Text style={styles.resubmitCtaText}>Record New Submission</Text>
          <Feather name="chevron-right" size={13} color="#f59e0b" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      paddingTop: 20,
      alignItems: "center" as const,
    },
    headerLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
      letterSpacing: 1,
      textTransform: "uppercase" as const,
      textAlign: "center" as const,
    },
    headerTitle: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
      marginTop: 2,
      textAlign: "center" as const,
    },

    segmented: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.muted,
      borderRadius: 10,
      padding: 3,
      gap: 2,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      borderRadius: 8,
      gap: 6,
    },
    segmentBtnActive: {
      backgroundColor: colors.card,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    segmentText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    segmentTextActive: {
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    badge: {
      backgroundColor: "#06b6d4",
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    badgePurple: { backgroundColor: "#7c3aed" },
    badgeText: {
      fontSize: 10,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },

    list: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },

    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    taskTitle: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.2,
    },

    readyBadge: {
      backgroundColor: "#0c2033",
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: "#164e63",
    },
    readyBadgeText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: "#06b6d4",
    },

    uploadProgress: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "#0e0826",
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: "#4c1d95",
    },
    uploadProgressText: { flex: 1, gap: 6 },
    uploadProgressLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: "#a78bfa",
    },
    progressBar: {
      height: 3,
      backgroundColor: "#1e1b4b",
      borderRadius: 2,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: "#8b5cf6",
      borderRadius: 2,
    },

    cardBottom: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    dateText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    typeRow: {},
    typeText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      backgroundColor: colors.muted,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    payoutRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
    payoutText: {
      fontSize: 12,
      color: colors.primary,
      fontFamily: "Inter_500Medium",
    },
    retryHint: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
    },
    retryHintText: {
      fontSize: 11,
      color: "#f87171",
      fontFamily: "Inter_500Medium",
    },
    cardActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    submitCardBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "#7c3aed",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    submitCardBtnText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    deleteBtn: { padding: 4 },

    reasonBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      backgroundColor: "#1c0a0a",
      borderRadius: 8,
      padding: 8,
      borderWidth: 1,
      borderColor: "#3b0a0a",
    },
    reasonText: {
      flex: 1,
      fontSize: 12,
      color: "#f87171",
      fontFamily: "Inter_400Regular",
      lineHeight: 17,
    },
    resubmitCta: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 6,
      backgroundColor: "#422006",
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "#78350f",
    },
    resubmitCtaText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: "#f59e0b",
    },

    empty: { alignItems: "center", paddingTop: 80, gap: 10 },
    emptyText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    emptySubtext: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
  });
}
