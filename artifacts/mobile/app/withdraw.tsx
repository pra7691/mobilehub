import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useGetPaymentMethodsMe,
  useGetMyWallet,
  usePostPayoutsRequest,
  useGetPayoutsMy,
  useGetAppSettings,
  getGetPayoutsMyQueryKey,
  getGetMyWalletQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";

export default function WithdrawScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const styles = makeStyles(colors);

  const { data: rawWallet } = useGetMyWallet();
  const wallet = rawWallet as unknown as {
    availableBalance: number;
    pendingBalance: number;
    pendingWithdrawalBalance: number;
  } | undefined;
  const { data: methods } = useGetPaymentMethodsMe();
  const { data: pendingPayouts } = useGetPayoutsMy({ page: 1, limit: 1, status: "PENDING" as never });
  const { data: processingPayouts } = useGetPayoutsMy({ page: 1, limit: 1, status: "PROCESSING" as never });
  const { data: appSettings } = useGetAppSettings();
  const requestMutation = usePostPayoutsRequest();

  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState("");

  const firstMethod = methods?.[0];
  const availableBalance = wallet ? Number(wallet.availableBalance) : 0;
  const pendingWithdrawal = wallet ? Number(wallet.pendingWithdrawalBalance ?? 0) : 0;

  const payoutSettings = (appSettings as unknown as { payout?: { payoutsEnabled?: boolean; minWithdrawalAmount?: number; maxWithdrawalAmount?: number | null; payoutMessage?: string | null } })?.payout;
  const payoutsEnabled = payoutSettings?.payoutsEnabled !== false;
  const minAmount = payoutSettings?.minWithdrawalAmount ?? 100;
  const maxAmount = payoutSettings?.maxWithdrawalAmount ?? null;
  const payoutMessage = payoutSettings?.payoutMessage;

  const hasActivePayout = (pendingPayouts?.meta?.total ?? 0) + (processingPayouts?.meta?.total ?? 0) > 0;

  function validateAmount(): boolean {
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) { setAmountError("Enter a valid amount"); return false; }
    if (num < minAmount) { setAmountError(`Minimum withdrawal is ₹${minAmount}`); return false; }
    if (maxAmount && num > maxAmount) { setAmountError(`Maximum withdrawal is ₹${maxAmount}`); return false; }
    if (num > availableBalance) { setAmountError("Insufficient balance"); return false; }
    setAmountError("");
    return true;
  }

  async function handleRequest() {
    if (!validateAmount()) return;
    if (!firstMethod) {
      Alert.alert("No UPI ID", "Please add your UPI ID before withdrawing.");
      return;
    }

    const num = parseFloat(amount);
    Alert.alert(
      "Confirm withdrawal",
      `Send ₹${num.toFixed(2)} to ${firstMethod.upiIdMasked}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              await requestMutation.mutateAsync({ data: { amount: num, paymentMethodId: firstMethod.id } });
              await Promise.all([
                qc.invalidateQueries({ queryKey: getGetPayoutsMyQueryKey({}) }),
                qc.invalidateQueries({ queryKey: getGetMyWalletQueryKey() }),
              ]);
              Alert.alert("Withdrawal requested!", "Your request is submitted and will be processed by admin.", [
                { text: "OK", onPress: () => router.back() },
              ]);
            } catch (e: unknown) {
              Alert.alert("Error", (e as { message?: string })?.message ?? "Failed to submit withdrawal");
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerLabel}>WALLET</Text>
          <Text style={styles.headerTitle}>Withdraw</Text>
        </View>
      </View>

      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>₹{availableBalance.toFixed(2)}</Text>
        {pendingWithdrawal > 0 && (
          <Text style={styles.pendingText}>₹{pendingWithdrawal.toFixed(2)} in pending withdrawal</Text>
        )}
      </View>

      {!payoutsEnabled && (
        <View style={styles.disabledBanner}>
          <Feather name="alert-circle" size={14} color="#ef4444" />
          <Text style={styles.disabledText}>Withdrawals are currently disabled</Text>
        </View>
      )}

      {payoutsEnabled && payoutMessage ? (
        <View style={styles.infoBanner}>
          <Feather name="info" size={14} color="#f59e0b" />
          <Text style={styles.infoText}>{payoutMessage}</Text>
        </View>
      ) : null}

      {/* Payment method */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sending to</Text>
        {!firstMethod ? (
          <TouchableOpacity style={styles.methodCard} onPress={() => router.push("/payment-details" as never)} activeOpacity={0.7}>
            <View style={styles.methodIcon}><Feather name="plus-circle" size={16} color={colors.primary} /></View>
            <Text style={styles.methodText}>Add UPI ID to withdraw</Text>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.methodCard, { borderColor: colors.border }]} onPress={() => router.push("/payment-details" as never)} activeOpacity={0.7}>
            <View style={[styles.methodIcon, { backgroundColor: colors.muted }]}><Feather name="credit-card" size={16} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.methodUpiText}>{firstMethod.upiIdMasked}</Text>
              <Text style={styles.methodStatusText}>Tap to update</Text>
            </View>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Amount input */}
      {payoutsEnabled && firstMethod && !hasActivePayout && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Amount</Text>
          <View style={[styles.amountRow, amountError ? styles.amountRowError : null]}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(v) => { setAmount(v); setAmountError(""); }}
              placeholder={`Min ₹${minAmount}`}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
          </View>
          {amountError ? <Text style={styles.errorText}>{amountError}</Text> : null}

          <View style={styles.quickRow}>
            {[100, 500, 1000, 2000]
              .filter((v) => v <= availableBalance && (!maxAmount || v <= maxAmount))
              .map((v) => (
                <TouchableOpacity key={v} style={styles.quickBtn} onPress={() => { setAmount(String(v)); setAmountError(""); }} activeOpacity={0.7}>
                  <Text style={styles.quickBtnText}>₹{v}</Text>
                </TouchableOpacity>
              ))}
            {availableBalance >= minAmount && (!maxAmount || availableBalance <= maxAmount) && (
              <TouchableOpacity style={styles.quickBtn} onPress={() => { setAmount(availableBalance.toFixed(2)); setAmountError(""); }} activeOpacity={0.7}>
                <Text style={styles.quickBtnText}>Max</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.limitHint}>Min ₹{minAmount}{maxAmount ? ` · Max ₹${maxAmount}` : ""}</Text>
        </View>
      )}

      {hasActivePayout && (
        <View style={styles.activeBanner}>
          <Feather name="clock" size={14} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={styles.activeBannerTitle}>Payout in progress</Text>
            <Text style={styles.activeBannerBody}>Please wait for your current request to complete before submitting a new one.</Text>
          </View>
        </View>
      )}

      {payoutsEnabled && firstMethod && !hasActivePayout && (
        <TouchableOpacity
          style={[styles.submitBtn, requestMutation.isPending && { opacity: 0.6 }]}
          onPress={handleRequest}
          disabled={requestMutation.isPending}
          activeOpacity={0.7}
        >
          {requestMutation.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <>
              <Feather name="arrow-up-right" size={16} color={colors.primaryForeground} />
              <Text style={styles.submitBtnText}>Request Withdrawal</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.historyLink} onPress={() => router.push("/payout-history" as never)} activeOpacity={0.7}>
        <Feather name="list" size={14} color={colors.primary} />
        <Text style={styles.historyLinkText}>View Payout History</Text>
        <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
      </TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: 60 },
    header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
    headerLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, letterSpacing: 1, textTransform: "uppercase" },
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.3 },
    balanceCard: { margin: 20, marginTop: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: "center" },
    balanceLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.8 },
    balanceAmount: { fontSize: 34, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 4 },
    pendingText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 6 },
    disabledBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginBottom: 8, backgroundColor: "#450a0a", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#7f1d1d" },
    disabledText: { fontSize: 13, color: "#ef4444", fontFamily: "Inter_500Medium" },
    infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 20, marginBottom: 8, backgroundColor: "#422006", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#92400e" },
    infoText: { flex: 1, fontSize: 13, color: "#f59e0b", fontFamily: "Inter_400Regular", lineHeight: 18 },
    section: { marginHorizontal: 20, marginTop: 16, gap: 8 },
    sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase" },
    methodCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
    methodIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    methodText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    methodUpiText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    methodStatusText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    amountRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, height: 56 },
    amountRowError: { borderColor: "#ef4444" },
    rupee: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, marginRight: 4 },
    amountInput: { flex: 1, fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground },
    errorText: { fontSize: 12, color: "#ef4444", fontFamily: "Inter_400Regular" },
    quickRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    quickBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.muted, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    quickBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground },
    limitHint: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    activeBanner: { flexDirection: "row", gap: 10, marginHorizontal: 20, marginTop: 16, backgroundColor: "#422006", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#92400e" },
    activeBannerTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#f59e0b" },
    activeBannerBody: { fontSize: 12, color: "#fde68a", fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 18 },
    submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 20, height: 52, backgroundColor: colors.primary, borderRadius: 14 },
    submitBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    historyLink: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginTop: 14, backgroundColor: colors.card, borderRadius: 10, padding: 13, borderWidth: 1, borderColor: colors.border },
    historyLinkText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground },
  });
}
