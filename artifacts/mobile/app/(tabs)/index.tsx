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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useListTasks, getListTasksQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  reward: number;
  status: string;
  category?: { name: string } | null;
}

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useListTasks({ status: "active" });
  const tasks: Task[] = (data as { data?: Task[] } | undefined)?.data ?? [];

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    setRefreshing(false);
  }

  function handleTask(task: Task) {
    Haptics.selectionAsync();
    router.push({ pathname: "/task/[id]", params: { id: task.id } });
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
          <Text style={styles.headerLabel}>Available</Text>
          <Text style={styles.headerTitle}>Tasks</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{tasks.length}</Text>
        </View>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!tasks.length}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleTask(item)}
            activeOpacity={0.75}
            testID={`card-task-${item.id}`}
          >
            <View style={styles.cardTop}>
              {item.category && (
                <View style={styles.categoryTag}>
                  <Text style={styles.categoryText}>{item.category.name}</Text>
                </View>
              )}
              <View style={styles.rewardChip}>
                <Feather name="dollar-sign" size={12} color={colors.primary} />
                <Text style={styles.rewardText}>₹{item.reward}</Text>
              </View>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.description && (
              <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
            )}
            <View style={styles.cardFooter}>
              <Text style={styles.cardAction}>View details</Text>
              <Feather name="arrow-right" size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="inbox" size={40} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No tasks available right now</Text>
            <Text style={styles.emptySubtext}>Check back later for new opportunities</Text>
          </View>
        }
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 16,
      paddingTop: 12,
    },
    headerLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" },
    headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.5, marginTop: 2 },
    badge: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    badgeText: { color: colors.primaryForeground, fontSize: 14, fontFamily: "Inter_600SemiBold" },
    list: { paddingHorizontal: 16, paddingBottom: 100, gap: 12 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    categoryTag: { backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
    categoryText: { fontSize: 11, color: colors.primary, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
    rewardChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.muted, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    rewardText: { fontSize: 13, color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    cardDesc: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 20 },
    cardFooter: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    cardAction: { fontSize: 13, color: colors.primary, fontFamily: "Inter_500Medium" },
    empty: { alignItems: "center", paddingTop: 80, gap: 10 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptySubtext: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  });
}
