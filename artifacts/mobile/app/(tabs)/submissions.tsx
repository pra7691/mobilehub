import React, { useState } from "react";
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
  useListSubmissions,
  getListSubmissionsQueryKey,
} from "@workspace/api-client-react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";
import { useDrafts } from "@/contexts/DraftContext";
import type { LocalDraft } from "@/lib/drafts";

interface Submission {
  id: string;
  status: "pending" | "approved" | "rejected" | "under_review";
  rewardAmount: number;
  createdAt: string;
  task?: { title: string; collectionType?: string } | null;
}

const SUBMISSION_STATUS_CONFIG = {
  pending: { label: "Pending", color: "#f59e0b", bg: "#422006" },
  approved: { label: "Approved", color: "#22c55e", bg: "#052e16" },
  rejected: { label: "Rejected", color: "#ef4444", bg: "#450a0a" },
  under_review: { label: "Under Review", color: "#8b5cf6", bg: "#2e1065" },
};

const COLLECTION_TYPE_ICON: Record<string, string> = {
  VIDEO: "🎥",
  IMAGE: "📷",
  AUDIO: "🎙️",
};

type TabId = "drafts" | "under_review" | "completed";

const TABS: { id: TabId; label: string }[] = [
  { id: "drafts", label: "Drafts" },
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
    tabParam === "drafts" ? "drafts" : tabParam === "completed" ? "completed" : "under_review"
  );
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useListSubmissions();
  const submissions: Submission[] =
    (data as { data?: Submission[] } | undefined)?.data ?? [];

  const { drafts, deleteDraft } = useDrafts();

  const underReview = submissions.filter(
    (s) => s.status === "pending" || s.status === "under_review"
  );
  const completed = submissions.filter(
    (s) => s.status === "approved" || s.status === "rejected"
  );

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({
      queryKey: getListSubmissionsQueryKey(),
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
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.75}
                onPress={() =>
                  router.push(
                    `/capture/review?taskId=${item.taskId}&draftId=${item.id}`
                  )
                }
                onLongPress={() => confirmDeleteDraft(item)}
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
                <View style={styles.cardBottom}>
                  <View style={styles.dateRow}>
                    <Feather name="calendar" size={12} color={colors.mutedForeground} />
                    <Text style={styles.dateText}>{date}</Text>
                  </View>
                  <View style={styles.typeRow}>
                    <Text style={styles.typeText}>{item.collectionType}</Text>
                  </View>
                  <View style={styles.payoutRow}>
                    <Feather name="trending-up" size={12} color={colors.primary} />
                    <Text style={styles.payoutText}>₹{item.paymentAmount}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => confirmDeleteDraft(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="trash-2" size={14} color="#6b7280" />
                  </TouchableOpacity>
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
          renderItem={({ item }) => <SubmissionCard item={item} styles={styles} colors={colors} />}
          ListHeaderComponent={isLoading ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <Feather name="clock" size={40} color={colors.mutedForeground} />
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
          renderItem={({ item }) => <SubmissionCard item={item} styles={styles} colors={colors} />}
          ListHeaderComponent={isLoading ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <Feather name="check-circle" size={40} color={colors.mutedForeground} />
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

function SubmissionCard({
  item,
  styles,
  colors,
}: {
  item: Submission;
  styles: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useColors>;
}) {
  const config =
    SUBMISSION_STATUS_CONFIG[item.status] ?? SUBMISSION_STATUS_CONFIG.pending;
  const date = new Date(item.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  return (
    <View style={styles.card} testID={`card-submission-${item.id}`}>
      <View style={styles.cardTop}>
        <Text style={styles.taskTitle} numberOfLines={1}>
          {item.task?.collectionType
            ? (COLLECTION_TYPE_ICON[item.task.collectionType] ?? "") + " "
            : ""}
          {item.task?.title ?? "Task"}
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
        {item.status === "approved" && (
          <View style={styles.payoutRow}>
            <Feather name="trending-up" size={12} color={colors.success} />
            <Text style={[styles.payoutText, { color: colors.success }]}>
              ₹{item.rewardAmount} earned
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      paddingTop: 12,
    },
    headerLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    headerTitle: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
      marginTop: 2,
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
    statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },

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

    cardBottom: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
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
    deleteBtn: { padding: 4 },

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
