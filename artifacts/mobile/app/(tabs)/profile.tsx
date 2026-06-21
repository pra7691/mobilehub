import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGetMe, useGetMyWallet, useListMySubmissions, usePatchNotificationsPreferences } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import Constants from "expo-constants";
import { TOKEN_STORAGE_KEY, PREF_STORAGE_KEY, DEFAULT_PREFS, type NotificationPreferences } from "@/hooks/useNotifications";

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

  const { data: user, isLoading: loadingUser } = useGetMe() as { data: User | undefined; isLoading: boolean };
  const { data: wallet } = useGetMyWallet() as { data: Wallet | undefined };
  const { data: allSubs } = useListMySubmissions({ limit: 1 }) as { data: SubListResponse | undefined };
  const { data: approvedSubs } = useListMySubmissions({ limit: 1, status: "APPROVED" }) as { data: SubListResponse | undefined };
  const { data: pendingSubs } = useListMySubmissions({ limit: 1, status: "UNDER_REVIEW" }) as { data: SubListResponse | undefined };

  const totalSubmissions = allSubs?.meta?.total ?? 0;
  const approvedCount = approvedSubs?.meta?.total ?? 0;
  const pendingCount = pendingSubs?.meta?.total ?? 0;
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const { mutate: updateNotifPrefs } = usePatchNotificationsPreferences();
  const [notifToken, setNotifToken] = useState<string | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);

  useEffect(() => {
    void (async () => {
      const [token, savedPrefs] = await Promise.all([
        AsyncStorage.getItem(TOKEN_STORAGE_KEY),
        AsyncStorage.getItem(PREF_STORAGE_KEY),
      ]);
      if (token) setNotifToken(token);
      if (savedPrefs) {
        try { setNotifPrefs(JSON.parse(savedPrefs) as NotificationPreferences); } catch {}
      }
    })();
  }, []);

  async function toggleNotifPref(
    key: keyof NotificationPreferences,
    value: boolean,
  ) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    await AsyncStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(updated));
    if (notifToken) {
      updateNotifPrefs({ data: { expoPushToken: notifToken, [key]: value } });
    }
  }

  async function handleLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
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
        <Text style={styles.headerLabel}>Account</Text>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <Text style={styles.name}>{user?.name ?? "Anonymous"}</Text>
      <Text style={styles.phone}>{user?.phoneNumber}</Text>

      {/* Balance row */}
      {wallet && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>₹{Number(wallet.availableBalance).toFixed(2)}</Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxCenter]}>
            <Text style={styles.statValue}>₹{Number(wallet.lifetimeEarnings).toFixed(2)}</Text>
            <Text style={styles.statLabel}>Lifetime</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalSubmissions}</Text>
            <Text style={styles.statLabel}>Uploads</Text>
          </View>
        </View>
      )}

      {/* Pending banner */}
      {wallet && Number(wallet.pendingBalance) > 0 && (
        <View style={styles.pendingBanner}>
          <Feather name="clock" size={13} color="#f59e0b" />
          <Text style={styles.pendingText}>
            ₹{Number(wallet.pendingBalance).toFixed(2)} pending review
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
          <Text style={styles.statementBtnText}>View Wallet Statement</Text>
          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}

      {/* Submission breakdown */}
      <View style={styles.subRow}>
        <View style={styles.subStat}>
          <Text style={styles.subNum}>{totalSubmissions}</Text>
          <Text style={styles.subLabel}>Total</Text>
        </View>
        <View style={[styles.subStat, styles.subStatCenter]}>
          <Text style={[styles.subNum, { color: "#10b981" }]}>{approvedCount}</Text>
          <Text style={styles.subLabel}>Approved</Text>
        </View>
        <View style={styles.subStat}>
          <Text style={[styles.subNum, { color: "#f59e0b" }]}>{pendingCount}</Text>
          <Text style={styles.subLabel}>Pending</Text>
        </View>
      </View>

      {/* Account Info */}
      <Text style={styles.sectionTitle}>Account Info</Text>
      <View style={styles.card}>
        <InfoRow icon="phone" label="Mobile Number" value={user?.phoneNumber ?? ""} colors={colors} />
        <InfoRow icon="hash" label="User ID" value={user?.id ? `#${user.id.slice(-8).toUpperCase()}` : ""} colors={colors} />
        <InfoRow
          icon="calendar"
          label="Member Since"
          value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : ""}
          colors={colors}
          last
        />
      </View>

      {/* Notifications */}
      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.card}>
        <ToggleRow
          label="Submission Updates"
          description="Approved, rejected, or changes requested"
          value={notifPrefs.notifySubmissionUpdates}
          onChange={(v) => void toggleNotifPref("notifySubmissionUpdates", v)}
          colors={colors}
        />
        <ToggleRow
          label="New Tasks"
          description="When new collection tasks go live"
          value={notifPrefs.notifyNewTasks}
          onChange={(v) => void toggleNotifPref("notifyNewTasks", v)}
          colors={colors}
        />
        <ToggleRow
          label="App Notices"
          description="Announcements and platform updates"
          value={notifPrefs.notifyAppNotices}
          onChange={(v) => void toggleNotifPref("notifyAppNotices", v)}
          colors={colors}
          last
        />
      </View>
      {!notifToken && (
        <Text style={styles.notifHint}>
          Allow notifications from your device settings to enable push alerts.
        </Text>
      )}

      {/* Help & Legal */}
      <Text style={styles.sectionTitle}>Help & Legal</Text>
      <View style={styles.card}>
        <MenuRow icon="headphones" label="Support" onPress={() => router.push("/support" as never)} colors={colors} />
        <MenuRow icon="help-circle" label="FAQ" onPress={() => router.push("/faq" as never)} colors={colors} />
        <MenuRow
          icon="shield"
          label="Privacy Policy"
          onPress={() => router.push({ pathname: "/static-page", params: { slug: "privacy-policy" } } as never)}
          colors={colors}
        />
        <MenuRow
          icon="file-text"
          label="Terms & Conditions"
          onPress={() => router.push({ pathname: "/static-page", params: { slug: "terms-and-conditions" } } as never)}
          colors={colors}
        />
        <MenuRow icon="info" label={`App Version ${appVersion}`} onPress={() => {}} colors={colors} chevron={false} last />
      </View>

      {/* Delete account note */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <MenuRow
          icon="message-circle"
          label="Contact Support to Delete Account"
          onPress={() => router.push("/support" as never)}
          colors={colors}
          muted
          last
        />
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="button-logout" activeOpacity={0.7}>
        <Feather name="log-out" size={18} color="#ef4444" />
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({
  icon, label, value, colors, last,
}: { icon: string; label: string; value: string; colors: ReturnType<typeof useColors>; last?: boolean }) {
  const s = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border },
    iconBox: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    lbl: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    val: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium", marginTop: 1 },
  });
  return (
    <View style={s.row}>
      <View style={s.iconBox}><Feather name={icon as "phone"} size={15} color={colors.primary} /></View>
      <View><Text style={s.lbl}>{label}</Text><Text style={s.val}>{value}</Text></View>
    </View>
  );
}

function MenuRow({
  icon, label, onPress, colors, chevron = true, muted = false, last = false,
}: { icon: string; label: string; onPress: () => void; colors: ReturnType<typeof useColors>; chevron?: boolean; muted?: boolean; last?: boolean }) {
  const s = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border },
    iconBox: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    lbl: { flex: 1, fontSize: 14, color: muted ? colors.mutedForeground : colors.foreground, fontFamily: "Inter_500Medium" },
  });
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.6}>
      <View style={s.iconBox}><Feather name={icon as "phone"} size={15} color={muted ? colors.mutedForeground : colors.primary} /></View>
      <Text style={s.lbl}>{label}</Text>
      {chevron && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
    </TouchableOpacity>
  );
}

function ToggleRow({
  label, description, value, onChange, colors, last,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (val: boolean) => void;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  const s = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border },
    textBlock: { flex: 1, marginRight: 12 },
    lbl: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium" },
    desc: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
  });
  return (
    <View style={s.row}>
      <View style={s.textBlock}>
        <Text style={s.lbl}>{label}</Text>
        {description && <Text style={s.desc}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#ffffff"
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: 120 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    header: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 20, alignItems: "center" as const },
    headerLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" as const, textAlign: "center" as const },
    headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.5, marginTop: 2, textAlign: "center" as const },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 10 },
    avatarText: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    name: { textAlign: "center", fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
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
    notifHint: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginHorizontal: 20, marginTop: 6, textAlign: "center", lineHeight: 16 },
  });
}
