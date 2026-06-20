import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useListSubcategories, type Subcategory } from "@workspace/api-client-react";

function SubcategoryCard({ sub, onPress }: { sub: Subcategory; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{sub.name}</Text>
        {sub.description ? <Text style={styles.cardDesc} numberOfLines={2}>{sub.description}</Text> : null}
        <View style={styles.cardMeta}>
          <View style={[styles.metaBadge, sub.taskCount > 0 && styles.metaBadgeActive]}>
            <Text style={[styles.metaText, sub.taskCount > 0 && styles.metaTextCyan]}>{sub.taskCount} tasks available</Text>
          </View>
        </View>
      </View>
      <Text style={styles.cardArrow}>›</Text>
    </TouchableOpacity>
  );
}

export default function CategoryScreen() {
  const { id, name, icon } = useLocalSearchParams<{ id: string; name: string; icon: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useListSubcategories({ categoryId: id, isActive: true, limit: 50 });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const subcategories = (data?.data ?? []).filter(s => s.isActive);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.categoryIcon}>{icon || "📁"}</Text>
          <View>
            <Text style={styles.headerTitle}>{name}</Text>
            <Text style={styles.headerSubtitle}>{data?.meta.total ?? 0} subcategories</Text>
          </View>
        </View>
      </View>

      {isLoading && !data ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#06b6d4" size="large" />
        </View>
      ) : (
        <FlatList
          data={subcategories}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
          renderItem={({ item }) => (
            <SubcategoryCard
              sub={item}
              onPress={() => router.push({ pathname: "/subcategory/[id]", params: { id: item.id, name: item.name, categoryName: name, categoryIcon: icon ?? "📁" } })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyText}>No subcategories</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  header: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  backBtn: { marginBottom: 12 },
  backText: { fontSize: 16, color: "#06b6d4", fontFamily: "Inter_500Medium" },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  categoryIcon: { fontSize: 36 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#ffffff" },
  headerSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6b7280", marginTop: 2 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 10 },
  card: { backgroundColor: "#141414", borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 16, borderWidth: 1, borderColor: "#1f1f1f" },
  cardBody: { flex: 1 },
  cardName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#ffffff", marginBottom: 4 },
  cardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6b7280", marginBottom: 10, lineHeight: 17 },
  cardMeta: { flexDirection: "row" },
  metaBadge: { backgroundColor: "#1f1f1f", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#2a2a2a" },
  metaBadgeActive: { borderColor: "#164e63" },
  metaText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#6b7280" },
  metaTextCyan: { color: "#22d3ee" },
  cardArrow: { fontSize: 22, color: "#374151", marginLeft: 8 },
  emptyContainer: { alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: "#9ca3af" },
});
