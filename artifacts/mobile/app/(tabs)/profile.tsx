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
import { useGetMe, useGetMyWallet } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

interface User {
  id: string;
  phoneNumber: string;
  name?: string | null;
  status: string;
  totalEarnings: number;
  totalSubmissions: number;
}

interface Wallet {
  availableBalance: number;
  pendingBalance: number;
  lifetimeEarnings: number;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();

  const { data: user, isLoading: loadingUser } = useGetMe() as { data: User | undefined; isLoading: boolean };
  const { data: wallet } = useGetMyWallet() as { data: Wallet | undefined };

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
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Account</Text>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      <Text style={styles.name}>{user?.name ?? "Anonymous"}</Text>
      <Text style={styles.phone}>{user?.phoneNumber}</Text>

      {wallet && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>₹{wallet.availableBalance.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxCenter]}>
            <Text style={styles.statValue}>₹{wallet.lifetimeEarnings.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{user?.totalSubmissions ?? 0}</Text>
            <Text style={styles.statLabel}>Submissions</Text>
          </View>
        </View>
      )}

      {wallet && wallet.pendingBalance > 0 && (
        <View style={styles.pendingBanner}>
          <Feather name="clock" size={13} color="#f59e0b" />
          <Text style={styles.pendingText}>
            ₹{wallet.pendingBalance.toFixed(2)} pending review
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <MenuItem icon="phone" label={user?.phoneNumber ?? ""} subtitle="Phone number" colors={colors} />
        <MenuItem icon="check-circle" label={user?.status ?? "active"} subtitle="Account status" colors={colors} />
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        testID="button-logout"
        activeOpacity={0.7}
      >
        <Feather name="log-out" size={18} color="#ef4444" />
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function MenuItem({ icon, label, subtitle, colors }: { icon: string; label: string; subtitle: string; colors: ReturnType<typeof useColors> }) {
  const s = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    text: { flex: 1 },
    label: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground },
    subtitle: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  });
  return (
    <View style={s.row}>
      <View style={s.iconBox}>
        <Feather name={icon as "phone"} size={16} color={colors.primary} />
      </View>
      <View style={s.text}>
        <Text style={s.subtitle}>{subtitle}</Text>
        <Text style={s.label}>{label}</Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: 120 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    header: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 },
    headerLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" },
    headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.5, marginTop: 2 },
    avatar: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 12,
    },
    avatarText: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    name: { textAlign: "center", fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground },
    phone: { textAlign: "center", fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 4 },
    statsRow: {
      flexDirection: "row",
      marginHorizontal: 20,
      marginTop: 24,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    statBox: { flex: 1, alignItems: "center", paddingVertical: 16 },
    statBoxCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
    statValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    statLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    pendingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginHorizontal: 20,
      marginTop: 10,
      backgroundColor: "#422006",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: "#92400e",
    },
    pendingText: { fontSize: 12, color: "#f59e0b", fontFamily: "Inter_500Medium" },
    section: { marginHorizontal: 20, marginTop: 28 },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 20,
      marginTop: 32,
      backgroundColor: "#fef2f2",
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: "#fecaca",
    },
    logoutText: { fontSize: 15, color: "#ef4444", fontFamily: "Inter_600SemiBold" },
  });
}
