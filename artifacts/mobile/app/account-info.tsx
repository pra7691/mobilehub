import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useGetMe } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface User {
  id: string;
  phoneNumber: string;
  name?: string | null;
  status: string;
  createdAt?: string;
}

export default function AccountInfoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: user, isLoading } = useGetMe() as { data: User | undefined; isLoading: boolean };

  const styles = makeStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Account Info</Text>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.card}>
            <InfoRow icon="phone" label="Mobile Number" value={user?.phoneNumber ?? "—"} colors={colors} />
            <InfoRow icon="hash" label="User ID" value={user?.id ? `#${user.id.slice(-8).toUpperCase()}` : "—"} colors={colors} />
            <InfoRow icon="user" label="Name" value={user?.name ?? "Not set"} colors={colors} />
            <InfoRow icon="activity" label="Status" value={user?.status ?? "—"} colors={colors} />
            <InfoRow
              icon="calendar"
              label="Member Since"
              value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}
              colors={colors}
              last
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value, colors, last }: {
  icon: string; label: string; value: string;
  colors: ReturnType<typeof useColors>; last?: boolean;
}) {
  const s = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border },
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

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    backBtn: { paddingHorizontal: 20, paddingVertical: 12 },
    backText: { fontSize: 16, color: "#06b6d4", fontFamily: "Inter_500Medium" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 20 },
    card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  });
}
