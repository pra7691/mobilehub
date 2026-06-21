import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePatchNotificationsPreferences } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { TOKEN_STORAGE_KEY, PREF_STORAGE_KEY, DEFAULT_PREFS, type NotificationPreferences } from "@/hooks/useNotifications";
import * as Haptics from "expo-haptics";

export default function NotificationSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = makeStyles(colors);

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

  async function toggleNotifPref(key: keyof NotificationPreferences, value: boolean) {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    await AsyncStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(updated));
    if (notifToken) {
      updateNotifPrefs({ data: { expoPushToken: notifToken, [key]: value } });
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Notifications</Text>

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
          <Text style={styles.hint}>
            Allow notifications from your device settings to enable push alerts.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function ToggleRow({ label, description, value, onChange, colors, last }: {
  label: string; description?: string; value: boolean;
  onChange: (val: boolean) => void;
  colors: ReturnType<typeof useColors>; last?: boolean;
}) {
  const s = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border },
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
    backBtn: { paddingHorizontal: 20, paddingVertical: 12 },
    backText: { fontSize: 16, color: "#06b6d4", fontFamily: "Inter_500Medium" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 20 },
    card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
    hint: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 10, textAlign: "center", lineHeight: 16 },
  });
}
