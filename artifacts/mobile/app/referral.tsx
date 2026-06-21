import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Share,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Clipboard } from "react-native";
import { useGetMyReferralSummary, useGetMyReferralHistory } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { useState } from "react";

interface ReferralHistoryItem {
  id: string;
  referredUserMasked: string;
  status: "REGISTERED" | "REWARDED" | "CANCELLED";
  registeredAt: string;
  qualifiedAt?: string | null;
  rewardedAt?: string | null;
  rewardAmount?: number | null;
}

interface ReferralSummary {
  referralCode?: string | null;
  isEnabled: boolean;
  rewardAmount: number;
  message?: string | null;
  totalRegistered: number;
  totalRewarded: number;
  totalRewardsEarned: number;
}

function useToastSimple() {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const show = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };
  return { show, toastVisible, toastMsg };
}

export default function ReferralScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();

  const { data: summary, isLoading } = useGetMyReferralSummary() as {
    data: ReferralSummary | undefined;
    isLoading: boolean;
  };
  const { data: historyData } = useGetMyReferralHistory({ page: 1, limit: 10 }) as {
    data: { data: ReferralHistoryItem[]; meta: { total: number } } | undefined;
  };

  const toast = useToastSimple();
  const styles = makeStyles(colors);

  async function handleCopy() {
    if (!summary?.referralCode) return;
    Clipboard.setString(summary.referralCode);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.show(t("referral.codeCopied"));
  }

  async function handleShare() {
    if (!summary?.referralCode) return;
    const msg = summary.message
      ? `${summary.message}\n\nUse my referral code: ${summary.referralCode}`
      : `Join Capto and earn money! Use my referral code: ${summary.referralCode}`;
    await Share.share({ message: msg });
  }

  function statusColor(status: string) {
    if (status === "REWARDED") return "#10b981";
    if (status === "CANCELLED") return colors.destructive;
    return colors.mutedForeground;
  }

  function statusLabel(status: string) {
    if (status === "REWARDED") return t("referral.statusRewarded");
    if (status === "CANCELLED") return t("referral.statusCancelled");
    return t("referral.statusRegistered");
  }

  function fmtDate(dt?: string | null) {
    if (!dt) return "";
    return new Date(dt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!summary?.isEnabled) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Feather name="gift" size={48} color={colors.mutedForeground} />
        <Text style={styles.disabledText}>{t("referral.programDisabled")}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t("common.back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("referral.title")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Toast overlay */}
        {toast.toastVisible && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast.toastMsg}</Text>
          </View>
        )}

        {/* Reward info */}
        <View style={styles.rewardCard}>
          <View style={styles.rewardIconWrap}>
            <Feather name="gift" size={28} color={colors.primary} />
          </View>
          <Text style={styles.rewardTitle}>{t("referral.earnTitle", { amount: summary.rewardAmount })}</Text>
          <Text style={styles.rewardDesc}>
            {summary.message ?? t("referral.defaultMessage", { amount: summary.rewardAmount })}
          </Text>
        </View>

        {/* Referral code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>{t("referral.yourCode")}</Text>
          <View style={styles.codeRow}>
            <Text style={[styles.code, { color: colors.primary }]}>{summary.referralCode ?? "—"}</Text>
            <TouchableOpacity onPress={handleCopy} style={styles.copyBtn} activeOpacity={0.7}>
              <Feather name="copy" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
            <Feather name="share-2" size={16} color={colors.primaryForeground} />
            <Text style={styles.shareBtnText}>{t("referral.share")}</Text>
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{summary.totalRegistered}</Text>
            <Text style={styles.statLabel}>{t("referral.invited")}</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxCenter]}>
            <Text style={styles.statValue}>{summary.totalRewarded}</Text>
            <Text style={styles.statLabel}>{t("referral.rewarded")}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>₹{Number(summary.totalRewardsEarned).toFixed(0)}</Text>
            <Text style={styles.statLabel}>{t("referral.earned")}</Text>
          </View>
        </View>

        {/* How it works */}
        <Text style={styles.sectionTitle}>{t("referral.howItWorks")}</Text>
        <View style={styles.stepsCard}>
          {[
            { n: "1", label: t("referral.step1") },
            { n: "2", label: t("referral.step2") },
            { n: "3", label: t("referral.step3", { amount: summary.rewardAmount }) },
          ].map((s) => (
            <View key={s.n} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{s.n}</Text>
              </View>
              <Text style={styles.stepLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Recent referrals */}
        {(historyData?.data?.length ?? 0) > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t("referral.recentReferrals")}</Text>
            <View style={styles.historyCard}>
              {historyData!.data.map((item, idx) => (
                <View
                  key={item.id}
                  style={[styles.historyRow, idx === historyData!.data.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <View>
                    <Text style={styles.historyPhone}>{item.referredUserMasked}</Text>
                    <Text style={styles.historyDate}>{fmtDate(item.registeredAt)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.historyStatus, { color: statusColor(item.status) }]}>
                      {statusLabel(item.status)}
                    </Text>
                    {item.rewardAmount != null && (
                      <Text style={styles.historyReward}>₹{item.rewardAmount}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    disabledText: { color: colors.mutedForeground, marginTop: 12, fontSize: 15, textAlign: "center", paddingHorizontal: 32 },
    backBtn: { marginTop: 20, padding: 10 },
    backBtnText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
    toast: {
      position: "absolute",
      top: -8,
      alignSelf: "center",
      backgroundColor: colors.foreground,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
      zIndex: 100,
    },
    toastText: { color: colors.background, fontSize: 12, fontFamily: "Inter_500Medium" },
    rewardCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    rewardIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary + "20",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    rewardTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 6, textAlign: "center" },
    rewardDesc: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 18 },
    codeCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    codeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
    codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    code: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: 6 },
    copyBtn: { padding: 8 },
    shareBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 10,
    },
    shareBtnText: { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 },
    statsRow: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    statBox: { flex: 1, alignItems: "center", paddingVertical: 14 },
    statBoxCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
    statValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    statLabel: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
    sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6 },
    stepsCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
    },
    stepRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center" },
    stepNumText: { color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" },
    stepLabel: { flex: 1, color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
    historyCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
    },
    historyRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    historyPhone: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground },
    historyDate: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
    historyStatus: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    historyReward: { fontSize: 12, color: "#10b981", fontFamily: "Inter_500Medium", marginTop: 2 },
  });
}
