import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useListCategories, useGetPublicNotices, type Category, type Notice } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";

function CategoryCard({ category, onPress }: { category: Category; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardIconContainer}>
        <Text style={styles.cardIcon}>{category.icon || "📁"}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{category.name}</Text>
        {category.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{category.description}</Text>
        ) : null}
        <View style={styles.cardMeta}>
          <View style={styles.metaBadge}>
            <Text style={styles.metaText}>{category.subcategoryCount} subcategories</Text>
          </View>
          <View style={[styles.metaBadge, styles.metaBadgeTasks]}>
            <Text style={[styles.metaText, styles.metaTextCyan]}>{category.taskCount} tasks</Text>
          </View>
        </View>
      </View>
      <Text style={styles.cardArrow}>›</Text>
    </TouchableOpacity>
  );
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: (id: string) => void }) {
  return (
    <View style={styles.noticeBanner}>
      <Feather name="bell" size={14} color="#f59e0b" style={{ marginTop: 1 }} />
      <View style={styles.noticeTextBlock}>
        <Text style={styles.noticeTitle}>{notice.title}</Text>
        <Text style={styles.noticeContent}>{notice.content}</Text>
      </View>
      <TouchableOpacity onPress={() => onDismiss(notice.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={15} color="#92400e" />
      </TouchableOpacity>
    </View>
  );
}

export default function CategoriesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useListCategories({ isActive: true, limit: 50 });
  const { data: notices = [] } = useGetPublicNotices() as { data: Notice[] };

  const visibleNotices = notices.filter(n => n.isActive && !dismissedNotices.has(n.id));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function dismissNotice(id: string) {
    setDismissedNotices(prev => new Set([...prev, id]));
  }

  const categories = (data?.data ?? []).filter(c => c.isActive);

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Capto</Text>
          <Text style={styles.headerSubtitle}>Choose a task category</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#06b6d4" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Capto</Text>
        <Text style={styles.headerSubtitle}>Choose a task category</Text>
      </View>

      {visibleNotices.length > 0 && (
        <View style={styles.noticesList}>
          {visibleNotices.map(n => (
            <NoticeBanner key={n.id} notice={n} onDismiss={dismissNotice} />
          ))}
        </View>
      )}

      <FlatList
        data={categories}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
        renderItem={({ item }) => (
          <CategoryCard
            category={item}
            onPress={() => router.push({ pathname: "/category/[id]", params: { id: item.id, name: item.name, icon: item.icon ?? "📁" } })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyText}>No categories available</Text>
            <Text style={styles.emptySubtext}>Check back soon for new data collection tasks.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: "center" },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#ffffff", textAlign: "center" },
  headerSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6b7280", marginTop: 2, textAlign: "center" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  noticesList: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#422006",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#92400e",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  noticeTextBlock: { flex: 1 },
  noticeTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fbbf24" },
  noticeContent: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#d97706", marginTop: 2, lineHeight: 17 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  card: { backgroundColor: "#141414", borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, borderColor: "#1f1f1f" },
  cardIconContainer: { width: 56, height: 56, borderRadius: 14, backgroundColor: "#1a1a1a", justifyContent: "center", alignItems: "center", marginRight: 14, borderWidth: 1, borderColor: "#2a2a2a" },
  cardIcon: { fontSize: 28 },
  cardBody: { flex: 1 },
  cardName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#ffffff", marginBottom: 3 },
  cardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6b7280", marginBottom: 8, lineHeight: 17 },
  cardMeta: { flexDirection: "row", gap: 8 },
  metaBadge: { backgroundColor: "#1f1f1f", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#2a2a2a" },
  metaBadgeTasks: { borderColor: "#164e63" },
  metaText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#9ca3af" },
  metaTextCyan: { color: "#22d3ee" },
  cardArrow: { fontSize: 22, color: "#374151", marginLeft: 8 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#ffffff", marginBottom: 8 },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6b7280", textAlign: "center", lineHeight: 20 },
});
