import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useListTasks, type Task } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";

const TYPE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  VIDEO: { bg: "#2d1b69", text: "#c4b5fd", icon: "Video" },
  IMAGE: { bg: "#1e3a5f", text: "#93c5fd", icon: "Photo" },
  AUDIO: { bg: "#451a03", text: "#fdba74", icon: "Audio" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "#052e16", text: "#4ade80" },
  draft: { bg: "#422006", text: "#fbbf24" },
  inactive: { bg: "#1c1c1c", text: "#6b7280" },
};

function TaskCard({ task, onPress }: { task: Task; onPress: () => void }) {
  const typeStyle = TYPE_COLORS[task.collectionType] ?? TYPE_COLORS.IMAGE;
  const statusStyle = STATUS_COLORS[task.status] ?? STATUS_COLORS.inactive;
  const isVideoOrAudio = task.collectionType === "VIDEO" || task.collectionType === "AUDIO";
  const isImage = task.collectionType === "IMAGE";

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: typeStyle.bg }]}>
          <Text style={styles.typeBadgeIcon}>{typeStyle.icon}</Text>
          <Text style={[styles.typeBadgeText, { color: typeStyle.text }]}>{task.collectionType}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>{task.status.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
      {task.description ? <Text style={styles.taskDesc} numberOfLines={2}>{task.description}</Text> : null}

      <View style={styles.taskFooter}>
        <View style={styles.paymentContainer}>
          <Text style={styles.paymentAmount}>₹{task.paymentAmount}</Text>
          <Text style={styles.paymentCurrency}>{task.currency}</Text>
        </View>
        <View style={styles.taskInfo}>
          {isVideoOrAudio && task.minimumDurationSeconds != null && (
            <Text style={styles.taskInfoText}>{task.minimumDurationSeconds}s{task.maximumDurationSeconds ? `–${task.maximumDurationSeconds}s` : ""}</Text>
          )}
          {isImage && task.minimumImageCount != null && (
            <Text style={styles.taskInfoText}>{task.minimumImageCount}{task.maximumImageCount ? `–${task.maximumImageCount}` : "+"} photos</Text>
          )}
        </View>
        <Text style={styles.cardArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function SubcategoryScreen() {
  const { id, name, categoryName, categoryIcon } = useLocalSearchParams<{ id: string; name: string; categoryName: string; categoryIcon: string }>();
  const router = useRouter();
  const { language, t } = useLanguage();
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useListTasks({
    subcategoryId: id,
    status: "active" as any,
    collectionType: activeTypeFilter as any ?? undefined,
    limit: 50,
    language: language as any,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const tasks = data?.data ?? [];

  const typeFilters = [
    { label: "All", value: null },
    { label: "Video", value: "VIDEO" },
    { label: "Image", value: "IMAGE" },
    { label: "Audio", value: "AUDIO" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.breadcrumb}>
          <Text style={styles.breadcrumbCategory}>{categoryIcon} {categoryName}</Text>
          <Text style={styles.breadcrumbSep}>›</Text>
          <Text style={styles.breadcrumbSub}>{name}</Text>
        </View>
        <Text style={styles.headerCount}>{data?.meta.total ?? 0} available tasks</Text>
      </View>

      {/* Type filter chips */}
      <View style={styles.filterRow}>
        {typeFilters.map(f => (
          <TouchableOpacity
            key={String(f.value)}
            onPress={() => setActiveTypeFilter(f.value)}
            style={[styles.filterChip, activeTypeFilter === f.value && styles.filterChipActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, activeTypeFilter === f.value && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && !data ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#06b6d4" size="large" />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onPress={() => router.push({ pathname: "/task/[id]", params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}></Text>
              <Text style={styles.emptyText}>No tasks available</Text>
              {activeTypeFilter && <Text style={styles.emptySubtext}>Try removing the filter</Text>}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  backBtn: { marginBottom: 10 },
  backText: { fontSize: 16, color: "#06b6d4", fontFamily: "Inter_500Medium" },
  breadcrumb: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  breadcrumbCategory: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6b7280" },
  breadcrumbSep: { color: "#374151", fontSize: 13 },
  breadcrumbSub: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#ffffff" },
  headerCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6b7280", marginTop: 4 },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: "#141414" },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  filterChipActive: { backgroundColor: "#164e63", borderColor: "#0e7490" },
  filterChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#9ca3af" },
  filterChipTextActive: { color: "#22d3ee" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 10 },
  card: { backgroundColor: "#141414", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#1f1f1f" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeIcon: { fontSize: 12 },
  typeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  taskTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#ffffff", marginBottom: 5, lineHeight: 21 },
  taskDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6b7280", lineHeight: 17, marginBottom: 12 },
  taskFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  paymentContainer: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  paymentAmount: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#06b6d4" },
  paymentCurrency: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#0891b2" },
  taskInfo: { flex: 1 },
  taskInfoText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9ca3af" },
  cardArrow: { fontSize: 20, color: "#374151" },
  emptyContainer: { alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: "#9ca3af" },
  emptySubtext: { fontSize: 13, color: "#6b7280", marginTop: 4 },
});
