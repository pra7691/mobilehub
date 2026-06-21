import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGetPayoutsMy, getGetPayoutsMyQueryKey } from "@workspace/api-client-react";
import type { PayoutRequestItem } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type PayoutStatus = "PENDING" | "PROCESSING" | "PAID" | "REJECTED" | "CANCELLED";

const STATUS_CFG: Record<PayoutStatus, { label: string; bg: string; text: string; icon: string }> = {
  PENDING: { label: "Pending", bg: "#422006", text: "#f59e0b", icon: "clock" },
  PROCESSING: { label: "Processing", bg: "#172554", text: "#60a5fa", icon: "loader" },
  PAID: { label: "Paid", bg: "#052e16", text: "#22c55e", icon: "check-circle" },
  REJECTED: { label: "Rejected", bg: "#450a0a", text: "#ef4444", icon: "x-circle" },
  CANCELLED: { label: "Cancelled", bg: "#1c1c1e", text: "#6b7280", icon: "minus-circle" },
};

const FILTER_OPTIONS: Array<PayoutStatus | undefined> = [undefined, "PENDING", "PROCESSING", "PAID", "REJECTED"];

function hasActiveStatus(status: string) {
  return status === "PENDING" || status === "PROCESSING";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function PayoutHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = makeStyles(colors);

  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<PayoutStatus | undefined>(undefined);
  const [selected, setSelected] = useState<PayoutRequestItem | null>(null);

  const shouldPoll = filter === undefined || filter === "PENDING" || filter === "PROCESSING";
  const queryParams = { page, limit: 20, ...(filter ? { status: filter as never } : {}) };

  const { data, isLoading, refetch } = useGetPayoutsMy(queryParams, {
    query: {
      queryKey: getGetPayoutsMyQueryKey(queryParams),
      refetchInterval: shouldPoll ? 15_000 : false,
    },
  });

  const payouts = data?.data ?? [];
  const meta = data?.meta;

  async function handleRefresh() {
    setRefreshing(true);
    setPage(1);
    await refetch();
    setRefreshing(false);
  }

  function filterLabel(s: PayoutStatus | undefined) {
    return s ? STATUS_CFG[s].label : "All";
  }

  function renderItem({ item }: { item: PayoutRequestItem }) {
    const status = item.status as PayoutStatus;
    const cfg = STATUS_CFG[status] ?? STATUS_CFG.PENDING;
    const date = new Date(item.requestedAt).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => setSelected(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.statusIcon, { backgroundColor: cfg.bg }]}>
          <Feather name={cfg.icon as "clock"} size={16} color={cfg.text} />
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowUpi} numberOfLines={1}>{item.upiIdMasked}</Text>
          <Text style={styles.rowDate}>{date}</Text>
          {item.rejectionReason ? (
            <Text style={styles.rowReject} numberOfLines={1}>{item.rejectionReason}</Text>
          ) : null}
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowAmount}>₹{Number(item.amount).toFixed(2)}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
          {hasActiveStatus(item.status) && (
            <View style={styles.liveIndicator}>
              <View style={[styles.liveDot, { backgroundColor: cfg.text }]} />
              <Text style={[styles.liveText, { color: cfg.text }]}>Live</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  const selectedStatus = selected ? (selected.status as PayoutStatus) : undefined;
  const selectedCfg = selectedStatus ? STATUS_CFG[selectedStatus] : undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerLabel}>WALLET</Text>
          <Text style={styles.headerTitle}>Payout History</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((s) => {
          const active = filter === s;
          return (
            <TouchableOpacity
              key={String(s)}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
              onPress={() => { setFilter(s); setPage(1); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterBtnText, active && styles.filterBtnTextActive]}>
                {filterLabel(s)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading && page === 1 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={payouts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="inbox" size={40} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>No payout requests</Text>
              <Text style={styles.emptySubtext}>Your withdrawal history will appear here</Text>
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
        />
      )}

      {/* Detail modal */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelected(null)}>
          <Pressable style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
            {selected && selectedCfg && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHandle} />

                <View style={styles.modalHeader}>
                  <View style={[styles.modalStatusIcon, { backgroundColor: selectedCfg.bg }]}>
                    <Feather name={selectedCfg.icon as "clock"} size={22} color={selectedCfg.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalAmount}>₹{Number(selected.amount).toFixed(2)}</Text>
                    <View style={[styles.badge, { backgroundColor: selectedCfg.bg, alignSelf: "flex-start" }]}>
                      <Text style={[styles.badgeText, { color: selectedCfg.text }]}>{selectedCfg.label}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalSection}>
                  <DetailRow label="UPI ID" value={selected.upiIdMasked} colors={colors} />
                  <DetailRow label="Requested" value={formatDate(selected.requestedAt)} colors={colors} />
                  {selected.processingStartedAt && (
                    <DetailRow label="Processing started" value={formatDate(selected.processingStartedAt)} colors={colors} />
                  )}
                  {selected.paidAt && (
                    <DetailRow label="Paid at" value={formatDate(selected.paidAt)} colors={colors} />
                  )}
                  {selected.rejectedAt && (
                    <DetailRow label="Rejected at" value={formatDate(selected.rejectedAt)} colors={colors} />
                  )}
                  {selected.cancelledAt && (
                    <DetailRow label="Cancelled at" value={formatDate(selected.cancelledAt)} colors={colors} />
                  )}
                  {selected.payoutReferenceId && (
                    <DetailRow label="Reference ID" value={selected.payoutReferenceId} colors={colors} mono />
                  )}
                  {selected.rejectionReason && (
                    <DetailRow label="Rejection reason" value={selected.rejectionReason} colors={colors} highlight="error" />
                  )}
                  {selected.adminNote && (
                    <DetailRow label="Note from admin" value={selected.adminNote} colors={colors} />
                  )}
                </View>

                {hasActiveStatus(selected.status) && (
                  <View style={styles.pollingNote}>
                    <View style={[styles.liveDot, { backgroundColor: selectedCfg.text }]} />
                    <Text style={[styles.pollingNoteText, { color: selectedCfg.text }]}>
                      Status refreshes automatically every 15 seconds
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function DetailRow({
  label,
  value,
  colors,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  mono?: boolean;
  highlight?: "error";
}) {
  const valueColor = highlight === "error" ? "#ef4444" : colors.foreground;
  return (
    <View style={detailRowStyles.row}>
      <Text style={[detailRowStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[detailRowStyles.value, { color: valueColor, fontFamily: mono ? "Inter_400Regular" : "Inter_500Medium" }]}>
        {value}
      </Text>
    </View>
  );
}

const detailRowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  label: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 0 },
  value: { fontSize: 13, flex: 1, textAlign: "right", lineHeight: 18 },
});

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
    headerLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, letterSpacing: 1, textTransform: "uppercase" },
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.3 },
    filterRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingBottom: 10, flexWrap: "wrap" },
    filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
    filterBtnActive: { backgroundColor: colors.primary },
    filterBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    filterBtnTextActive: { color: colors.primaryForeground },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
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
    statusIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 },
    rowInfo: { flex: 1, gap: 3 },
    rowUpi: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    rowDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    rowReject: { fontSize: 12, color: "#ef4444", fontFamily: "Inter_400Regular" },
    rowRight: { alignItems: "flex-end", gap: 6 },
    rowAmount: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
    liveIndicator: { flexDirection: "row", alignItems: "center", gap: 4 },
    liveDot: { width: 6, height: 6, borderRadius: 3 },
    liveText: { fontSize: 10, fontFamily: "Inter_500Medium" },
    loadMore: { alignItems: "center", paddingVertical: 16 },
    loadMoreText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.primary },
    empty: { alignItems: "center", paddingTop: 80, gap: 10 },
    emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptySubtext: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    modalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 12,
      maxHeight: "85%",
    },
    modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 },
    modalHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
    modalStatusIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    modalAmount: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 6 },
    modalSection: { borderTopWidth: 1, borderTopColor: colors.border },
    pollingNote: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, backgroundColor: colors.muted, borderRadius: 10, padding: 12 },
    pollingNoteText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  });
}
