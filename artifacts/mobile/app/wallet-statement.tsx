import React, { useState } from "react";
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
import { useListMyWalletTransactions } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { formatINR } from "@/utils/formatCurrency";

const PAGE_SIZE = 20;

function sourceLabel(sourceType: string): string {
  switch (sourceType) {
    case "SUBMISSION_APPROVAL":
      return "Submission approved";
    case "PAYOUT":
      return "Withdrawal";
    case "WITHDRAWAL":
      return "Withdrawal";
    case "ADJUSTMENT":
      return "Manual adjustment";
    case "REVERSAL":
      return "Reversal";
    default:
      return sourceType.replace(/_/g, " ").toLowerCase();
  }
}

function txLabel(type: string, sourceType: string): string {
  if (type === "PAYOUT_HOLD") return "Withdrawal requested";
  if (type === "PAYOUT_REVERSED") return "Withdrawal returned";
  return sourceLabel(sourceType);
}

export default function WalletStatementScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = makeStyles(colors);

  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useListMyWalletTransactions({ page, limit: PAGE_SIZE });

  const transactions = data?.data ?? [];
  const meta = data?.meta;

  async function handleRefresh() {
    setRefreshing(true);
    setPage(1);
    await refetch();
    setRefreshing(false);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>ACCOUNT</Text>
          <Text style={styles.headerTitle}>Wallet</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/withdraw" as never)}
          style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground }}>Withdraw</Text>
        </TouchableOpacity>
      </View>

      {isLoading && page === 1 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptySubtext}>Approved submissions will appear here</Text>
            </View>
          }
          ListFooterComponent={
            meta && page < meta.totalPages ? (
              <TouchableOpacity style={styles.loadMore} onPress={() => setPage((p) => p + 1)}>
                {isLoading ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={styles.loadMoreText}>Load more</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => {
            const isCredit = item.type === "CREDIT";
            const amountColor = isCredit ? "#22c55e" : "#ef4444";
            const amountPrefix = isCredit ? "+" : "−";
            const date = new Date(item.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            return (
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: isCredit ? "#052e16" : "#450a0a" }]}>
                  <Feather
                    name={isCredit ? "arrow-down-left" : "arrow-up-right"}
                    size={16}
                    color={amountColor}
                  />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {txLabel(item.type, item.sourceType)}
                  </Text>
                  <Text style={styles.rowDate}>{date}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowAmount, { color: amountColor }]}>
                    {amountPrefix}{formatINR(item.amount)}
                  </Text>
                  <Text style={styles.rowBalance}>
                    Bal: {formatINR(item.balanceAfter)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 20,
      paddingBottom: 14,
      paddingTop: 20,
    },
    backBtn: { padding: 2 },
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
    list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    rowInfo: { flex: 1, gap: 2 },
    rowLabel: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      textTransform: "capitalize",
    },
    rowDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    rowRight: { alignItems: "flex-end", gap: 2 },
    rowAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
    rowBalance: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    loadMore: {
      alignItems: "center",
      paddingVertical: 16,
    },
    loadMoreText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    empty: { alignItems: "center", paddingTop: 80, gap: 10 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptySubtext: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
  });
}
