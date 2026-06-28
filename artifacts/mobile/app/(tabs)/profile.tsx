import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useGetMe, useGetMyWallet, useListMySubmissions, useGetAppSettings } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import Constants from "expo-constants";
import { getEnvInfo } from "@/components/EnvBanner";

interface User {
  id: string;
  phoneNumber: string;
  name?: string | null;
  status: string;
  createdAt?: string;
}

interface Wallet {
  availableBalance: number;
  pendingBalance: number;
  lifetimeEarnings: number;
}

interface SubListResponse {
  meta?: { total?: number };
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const router = useRouter();
  const { t, language } = useLanguage();

  const { data: user, isLoading: loadingUser } = useGetMe() as { data: User | undefined; isLoading: boolean };
  const { data: wallet } = useGetMyWallet() as { data: Wallet | undefined };
  const { data: allSubs } = useListMySubmissions({ limit: 1 }) as { data: SubListResponse | undefined };
  const { data: approvedSubs } = useListMySubmissions({ limit: 1, status: "APPROVED" }) as { data: SubListResponse | undefined };
  const { data: pendingSubs } = useListMySubmissions({ limit: 1, status: "UNDER_REVIEW" }) as { data: SubListResponse | undefined };
  const { data: appSettings } = useGetAppSettings();

  const totalSubmissions = allSubs?.meta?.total ?? 0;
  const approvedCount = approvedSubs?.meta?.total ?? 0;
  const pendingCount = pendingSubs?.meta?.total ?? 0;
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const currentLanguageLabel = language === "hi" ? "हिंदी" : "English";

  async function handleLogout() {
    Alert.alert(t("profile.logoutTitle"), t("profile.logoutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.logout"),
        style: "destructive",
        onPress: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
        },
      },
    ]);
  }

  const styles = makeStyles(colors);

  if (loadingUser) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.phoneNumber?.slice(-2) ?? "??";

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>{t("profile.myAccount")}</Text>
        <Text style={styles.headerTitle}>{t("profile.title")}</Text>
      </View>

      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <Text style={styles.phone}>{user?.phoneNumber}</Text>

      {/* Balance row */}
      {wallet && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>₹{Number(wallet.availableBalance).toFixed(2)}</Text>
            <Text style={styles.statLabel}>{t("wallet.available")}</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxCenter]}>
            <Text style={styles.statValue}>₹{Number(wallet.lifetimeEarnings).toFixed(2)}</Text>
            <Text style={styles.statLabel}>{t("wallet.lifetime")}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalSubmissions}</Text>
            <Text style={styles.statLabel}>{t("submissions.title")}</Text>
          </View>
        </View>
      )}

      {/* Pending banner */}
      {wallet && Number(wallet.pendingBalance) > 0 && (
        <View style={styles.pendingBanner}>
          <Feather name="clock" size={13} color="#f59e0b" />
          <Text style={styles.pendingText}>
            ₹{Number(wallet.pendingBalance).toFixed(2)} {t("wallet.pending").toLowerCase()}
          </Text>
        </View>
      )}

      {/* Wallet statement link */}
      {wallet && (
        <TouchableOpacity
          style={styles.statementBtn}
          onPress={() => router.push("/wallet-statement" as never)}
          activeOpacity={0.7}
        >
          <Feather name="list" size={14} color={colors.primary} />
          <Text style={styles.statementBtnText}>{t("wallet.viewStatement")}</Text>
          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}

      {/* Submission breakdown */}
      <View style={styles.subRow}>
        <View style={styles.subStat}>
          <Text style={styles.subNum}>{totalSubmissions}</Text>
          <Text style={styles.subLabel}>{t("submissions.all")}</Text>
        </View>
        <View style={[styles.subStat, styles.subStatCenter]}>
          <Text style={[styles.subNum, { color: "#10b981" }]}>{approvedCount}</Text>
          <Text style={styles.subLabel}>{t("submissions.approved")}</Text>
        </View>
        <View style={styles.subStat}>
          <Text style={[styles.subNum, { color: "#f59e0b" }]}>{pendingCount}</Text>
          <Text style={styles.subLabel}>{t("submissions.underReview")}</Text>
        </View>
      </View>

      {/* Settings */}
      <Text style={styles.sectionTitle}>Settings</Text>
      <View style={styles.card}>
        <MenuRow icon="user" label={t("profile.title")} onPress={() => router.push("/account-info" as never)} colors={colors} />
        <MenuRow icon="credit-card" label={t("profile.paymentDetails")} onPress={() => router.push("/payment-details" as never)} colors={colors} />
        <MenuRow icon="bell" label="Notifications" onPress={() => router.push("/notification-settings" as never)} colors={colors} />
        <MenuRow
          icon="gift"
          label={t("referral.title")}
          onPress={() => router.push("/referral" as never)}
          colors={colors}
        />
        <MenuRow
          icon="globe"
          label={t("profile.language")}
          sublabel={currentLanguageLabel}
          onPress={() => router.push("/language-settings" as never)}
          colors={colors}
          last
        />
      </View>

      {/* Help & Legal */}
      <Text style={styles.sectionTitle}>{t("support.title")} & Legal</Text>
      <View style={styles.card}>
        <MenuRow icon="headphones" label={t("support.title")} onPress={() => router.push("/support" as never)} colors={colors} />
        <MenuRow icon="help-circle" label={t("faq.title")} onPress={() => router.push("/faq" as never)} colors={colors} />
        {appSettings?.legal?.privacyPolicy && (
          <MenuRow
            icon="shield"
            label={t("legal.privacyPolicy")}
            onPress={() => router.push({ pathname: "/legal-content", params: { slug: "privacy-policy" } } as never)}
            colors={colors}
          />
        )}
        {appSettings?.legal?.termsAndConditions && (
          <MenuRow
            icon="file-text"
            label={t("legal.terms")}
            onPress={() => router.push({ pathname: "/legal-content", params: { slug: "terms-and-conditions" } } as never)}
            colors={colors}
          />
        )}
        {(() => {
          const { apiHost, envLabel, dbLabel } = getEnvInfo();
          const isNonProd = envLabel !== "Production";
          return (
            <>
              <MenuRow
                icon="info"
                label={t("profile.version", { version: appVersion })}
                onPress={() => {}}
                colors={colors}
                chevron={false}
                last={!isNonProd}
              />
              {isNonProd && (
                <View style={{ paddingTop: 6, paddingBottom: 10, gap: 4 }}>
                  {envLabel === "Staging" && (
                    <Text style={{ fontSize: 11, color: "#06b6d4", fontFamily: "Inter_500Medium", textAlign: "center", letterSpacing: 0.3, marginBottom: 4 }}>
                      QA Build • Staging
                    </Text>
                  )}
                  <DiagRow label="API" value={apiHost} />
                  <DiagRow label="Environment" value={envLabel} />
                  <DiagRow label="Database" value={dbLabel} />
                </View>
              )}
            </>
          );
        })()}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="button-logout" activeOpacity={0.7}>
        <Feather name="log-out" size={18} color="#ef4444" />
        <Text style={styles.logoutText}>{t("profile.logout")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}


function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter_500Medium" }}>{label}</Text>
      <Text style={{ fontSize: 11, color: "#9ca3af", fontFamily: "Inter_400Regular", flexShrink: 1, textAlign: "right" }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function MenuRow({
  icon, label, sublabel, onPress, colors, chevron = true, muted = false, last = false,
}: {
  icon: string; label: string; sublabel?: string; onPress: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  chevron?: boolean; muted?: boolean; last?: boolean;
}) {
  const s = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border },
    iconBox: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    labelBlock: { flex: 1 },
    lbl: { fontSize: 14, color: muted ? colors.mutedForeground : colors.foreground, fontFamily: "Inter_500Medium" },
    sub: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 },
  });
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.6}>
      <View style={s.iconBox}><Feather name={icon as "phone"} size={15} color={muted ? colors.mutedForeground : colors.primary} /></View>
      <View style={s.labelBlock}>
        <Text style={s.lbl}>{label}</Text>
        {sublabel && <Text style={s.sub}>{sublabel}</Text>}
      </View>
      {chevron && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
    </TouchableOpacity>
  );
}


function makeStyles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: 120 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    header: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 20, alignItems: "center" as const },
    headerLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" as const, textAlign: "center" as const },
    headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.5, marginTop: 2, textAlign: "center" as const },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 10 },
    avatarText: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    phone: { textAlign: "center", fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 3 },
    statsRow: { flexDirection: "row", marginHorizontal: 20, marginTop: 20, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    statBox: { flex: 1, alignItems: "center", paddingVertical: 14 },
    statBoxCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
    statValue: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground },
    statLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    pendingBanner: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 20, marginTop: 8, backgroundColor: "#422006", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: "#92400e" },
    pendingText: { fontSize: 12, color: "#f59e0b", fontFamily: "Inter_500Medium" },
    statementBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, marginHorizontal: 20, marginTop: 10, backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.border },
    statementBtnText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground },
    subRow: { flexDirection: "row", marginHorizontal: 20, marginTop: 10, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    subStat: { flex: 1, alignItems: "center", paddingVertical: 12 },
    subStatCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
    subNum: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    subLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", marginHorizontal: 20, marginTop: 24, marginBottom: 8 },
    card: { marginHorizontal: 20, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
    logoutBtn: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 20, marginTop: 24, backgroundColor: "#1a0a0a", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, borderWidth: 1, borderColor: "#7f1d1d" },
    logoutText: { fontSize: 15, color: "#ef4444", fontFamily: "Inter_600SemiBold" },
  });
}
