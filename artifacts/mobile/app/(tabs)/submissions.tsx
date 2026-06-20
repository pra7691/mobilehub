import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useListSubmissions, getListSubmissionsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";

interface Submission {
  id: string;
  status: "pending" | "approved" | "rejected" | "under_review";
  rewardAmount: number;
  createdAt: string;
  task?: { title: string } | null;
}

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "#f59e0b", bg: "#fef3c7" },
  approved: { label: "Approved", color: "#22c55e", bg: "#dcfce7" },
  rejected: { label: "Rejected", color: "#ef4444", bg: "#fee2e2" },
  under_review: { label: "Under Review", color: "#8b5cf6", bg: "#ede9fe" },
};

export default function SubmissionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useListSubmissions();
  const submissions: Submission[] = (data as { data?: Submission[] } | undefined)?.data ?? [];

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey() });
    setRefreshing(false);
  }

  const styles = makeStyles(colors);

  if (isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>History</Text>
          <Text style={styles.headerTitle}>My Uploads</Text>
        </View>
      </View>

      <FlatList
        data={submissions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!submissions.length}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          const config = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
          const date = new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
          return (
            <View style={styles.card} testID={`card-submission-${item.id}`}>
              <View style={styles.cardTop}>
                <Text style={styles.taskTitle} numberOfLines={1}>{item.task?.title ?? "Task"}</Text>
                <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
                  <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
                </View>
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.dateRow}>
                  <Feather name="calendar" size={12} color={colors.mutedForeground} />
                  <Text style={styles.dateText}>{date}</Text>
                </View>
                {item.status === "approved" && (
                  <View style={styles.rewardRow}>
                    <Feather name="trending-up" size={12} color={colors.success} />
                    <Text style={styles.rewardText}>₹{item.rewardAmount} earned</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="upload-cloud" size={40} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No submissions yet</Text>
            <Text style={styles.emptySubtext}>Complete a task to see your uploads here</Text>
          </View>
        }
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  const SUCCESS = "#22c55e";
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 16,
      paddingTop: 12,
    },
    headerLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" },
    headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.5, marginTop: 2 },
    list: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    taskTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
    cardBottom: { flexDirection: "row", alignItems: "center", gap: 16 },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    dateText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    rewardRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    rewardText: { fontSize: 12, color: SUCCESS, fontFamily: "Inter_500Medium" },
    empty: { alignItems: "center", paddingTop: 80, gap: 10 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptySubtext: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  });
}
