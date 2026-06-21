import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useGetNotificationsMy,
  usePatchNotificationsIdRead,
  getGetNotificationsMyQueryKey,
} from "@workspace/api-client-react";
import type { AppNotification } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";

type NotifType =
  | "SUBMISSION_APPROVED"
  | "SUBMISSION_REJECTED"
  | "RESUBMISSION_REQUIRED"
  | "NEW_TASK"
  | "APP_NOTICE"
  | "PAYOUT_PAID"
  | "PAYOUT_REJECTED";

interface NotifConfig {
  label: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  badgeColor: string;
  badgeBg: string;
}

const NOTIF_CONFIG: Record<NotifType, NotifConfig> = {
  SUBMISSION_APPROVED: {
    label: "Submission Approved",
    icon: "check-circle",
    iconColor: "#22c55e",
    iconBg: "#052e16",
    badgeColor: "#22c55e",
    badgeBg: "#052e16",
  },
  SUBMISSION_REJECTED: {
    label: "Submission Rejected",
    icon: "x-circle",
    iconColor: "#ef4444",
    iconBg: "#450a0a",
    badgeColor: "#ef4444",
    badgeBg: "#450a0a",
  },
  RESUBMISSION_REQUIRED: {
    label: "Resubmission Required",
    icon: "refresh-cw",
    iconColor: "#f59e0b",
    iconBg: "#422006",
    badgeColor: "#f59e0b",
    badgeBg: "#422006",
  },
  NEW_TASK: {
    label: "New Task",
    icon: "bell",
    iconColor: "#60a5fa",
    iconBg: "#172554",
    badgeColor: "#60a5fa",
    badgeBg: "#172554",
  },
  APP_NOTICE: {
    label: "App Notice",
    icon: "info",
    iconColor: "#94a3b8",
    iconBg: "#1e293b",
    badgeColor: "#94a3b8",
    badgeBg: "#1e293b",
  },
  PAYOUT_PAID: {
    label: "Payout Paid",
    icon: "dollar-sign",
    iconColor: "#22c55e",
    iconBg: "#052e16",
    badgeColor: "#22c55e",
    badgeBg: "#052e16",
  },
  PAYOUT_REJECTED: {
    label: "Payout Rejected",
    icon: "dollar-sign",
    iconColor: "#ef4444",
    iconBg: "#450a0a",
    badgeColor: "#ef4444",
    badgeBg: "#450a0a",
  },
};

function getConfig(type: string): NotifConfig {
  return NOTIF_CONFIG[type as NotifType] ?? {
    label: type,
    icon: "bell",
    iconColor: "#94a3b8",
    iconBg: "#1e293b",
    badgeColor: "#94a3b8",
    badgeBg: "#1e293b",
  };
}

function isPayoutType(type: string): boolean {
  return type === "PAYOUT_PAID" || type === "PAYOUT_REJECTED";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const styles = makeStyles(colors);

  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const queryParams = { page, limit: 30 };
  const { data, isLoading, refetch } = useGetNotificationsMy(queryParams, {
    query: { queryKey: getGetNotificationsMyQueryKey(queryParams) },
  });

  const { mutate: markRead } = usePatchNotificationsIdRead();

  const notifications = data?.data ?? [];
  const meta = data?.meta;

  async function handleRefresh() {
    setRefreshing(true);
    setPage(1);
    await refetch();
    setRefreshing(false);
  }

  const handlePress = useCallback(
    (item: AppNotification) => {
      if (!item.isRead) {
        markRead(
          { id: item.id },
          {
            onSuccess: () => {
              void queryClient.invalidateQueries({
                queryKey: getGetNotificationsMyQueryKey(),
              });
            },
          }
        );
      }
      if (isPayoutType(item.type)) {
        router.push("/payout-history" as never);
      }
    },
    [markRead, queryClient, router]
  );

  function renderItem({ item }: { item: AppNotification }) {
    const cfg = getConfig(item.type);
    const isPayout = isPayoutType(item.type);

    return (
      <TouchableOpacity
        style={[styles.row, !item.isRead && styles.rowUnread]}
        onPress={() => handlePress(item)}
        activeOpacity={isPayout ? 0.7 : 0.85}
      >
        <View style={[styles.iconBox, { backgroundColor: cfg.iconBg }]}>
          <Feather name={cfg.icon as "bell"} size={17} color={cfg.iconColor} />
        </View>

        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <View style={[styles.badge, { backgroundColor: cfg.badgeBg }]}>
              <Text style={[styles.badgeText, { color: cfg.badgeColor }]}>
                {cfg.label}
              </Text>
            </View>
            <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
          </View>

          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>
            {item.body}
          </Text>

          {isPayout && (
            <View style={styles.tapHint}>
              <Feather name="arrow-right" size={11} color={colors.primary} />
              <Text style={styles.tapHintText}>View payout history</Text>
            </View>
          )}
        </View>

        {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>ACTIVITY</Text>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

      {isLoading && page === 1 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="bell-off" size={40} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySubtext}>
                Submission updates and payout alerts will appear here
              </Text>
            </View>
          }
          ListFooterComponent={
            meta && page < meta.totalPages ? (
              <TouchableOpacity
                style={styles.loadMore}
                onPress={() => setPage((p) => p + 1)}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={styles.loadMoreText}>Load more</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12,
    },
    headerLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    headerTitle: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { paddingHorizontal: 16, paddingBottom: 100, gap: 8 },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowUnread: {
      borderColor: colors.primary + "40",
      backgroundColor: colors.card,
    },
    iconBox: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginTop: 2,
    },
    rowContent: { flex: 1, gap: 4 },
    rowTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    badge: {
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    badgeText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
    },
    time: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginLeft: "auto",
    },
    title: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      lineHeight: 18,
    },
    body: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 17,
    },
    tapHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 2,
    },
    tapHintText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      flexShrink: 0,
      marginTop: 6,
    },
    loadMore: { alignItems: "center", paddingVertical: 16 },
    loadMoreText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
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
      maxWidth: 260,
      lineHeight: 18,
    },
  });
}
