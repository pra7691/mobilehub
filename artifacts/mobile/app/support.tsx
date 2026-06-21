import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGetPublicSupport } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";

interface SupportSettings {
  id: string;
  email: string;
  whatsappNumber: string;
  phoneNumber?: string | null;
  workingHours?: string | null;
  message?: string | null;
}

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language, t } = useLanguage();

  const { data: support, isLoading, isError } = useGetPublicSupport({ language: language as any }) as {
    data: SupportSettings | undefined;
    isLoading: boolean;
    isError: boolean;
  };

  function openEmail() {
    if (!support?.email) return;
    Linking.openURL(`mailto:${support.email}`).catch(() => {
      Alert.alert(t("errors.somethingWentWrong"));
    });
  }

  async function copyEmail() {
    if (!support?.email) return;
    await Clipboard.setStringAsync(support.email);
    Alert.alert(t("support.copied"), support.email);
  }

  function openWhatsApp() {
    if (!support?.whatsappNumber) return;
    const clean = support.whatsappNumber.replace(/[^0-9]/g, "");
    Linking.openURL(`https://wa.me/${clean}`).catch(() => {
      Alert.alert(t("errors.somethingWentWrong"));
    });
  }

  function openPhone() {
    if (!support?.phoneNumber) return;
    Linking.openURL(`tel:${support.phoneNumber}`).catch(() => {
      Alert.alert(t("errors.somethingWentWrong"));
    });
  }

  const styles = makeStyles(colors);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{t("support.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : isError ? (
          <View style={styles.centered}>
            <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
            <Text style={styles.errorText}>{t("errors.loadFailed")}</Text>
          </View>
        ) : (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Feather name="headphones" size={28} color={colors.primary} />
              </View>
              <Text style={styles.heroTitle}>{t("support.contactUs")}</Text>
              {support?.message ? (
                <Text style={styles.heroSubtitle}>{support.message}</Text>
              ) : (
                <Text style={styles.heroSubtitle}>{t("support.noContact")}</Text>
              )}
              {support?.workingHours && (
                <View style={styles.hoursRow}>
                  <Feather name="clock" size={12} color={colors.primary} />
                  <Text style={styles.hoursText}>{support.workingHours}</Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionLabel}>{t("support.contactUs")}</Text>

            {support?.email && (
              <View style={styles.card}>
                <View style={styles.cardIcon}>
                  <Feather name="mail" size={18} color={colors.primary} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardLabel}>{t("support.email")}</Text>
                  <Text style={styles.cardValue}>{support.email}</Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={openEmail}>
                    <Feather name="external-link" size={15} color={colors.primary} />
                    <Text style={styles.actionBtnText}>{t("support.emailUs")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { marginLeft: 8 }]} onPress={copyEmail}>
                    <Feather name="copy" size={15} color={colors.mutedForeground} />
                    <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>{t("support.tapToCopy")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {support?.whatsappNumber && (
              <TouchableOpacity style={styles.card} onPress={openWhatsApp} activeOpacity={0.7}>
                <View style={[styles.cardIcon, { backgroundColor: "#064e3b" }]}>
                  <Feather name="message-circle" size={18} color="#10b981" />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardLabel}>{t("support.whatsapp")}</Text>
                  <Text style={styles.cardValue}>{support.whatsappNumber}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}

            {support?.phoneNumber && (
              <TouchableOpacity style={styles.card} onPress={openPhone} activeOpacity={0.7}>
                <View style={styles.cardIcon}>
                  <Feather name="phone" size={18} color={colors.primary} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardLabel}>{t("support.phone")}</Text>
                  <Text style={styles.cardValue}>{support.phoneNumber}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { width: 40, height: 40, justifyContent: "center" },
    topBarTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    content: { padding: 20, paddingBottom: 40 },
    centered: { alignItems: "center", justifyContent: "center", paddingTop: 60 },
    errorText: { color: colors.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" },
    heroCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: "center",
      marginBottom: 28,
    },
    heroIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    heroTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" },
    heroSubtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6, lineHeight: 20 },
    hoursRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    hoursText: { fontSize: 12, color: colors.primary, fontFamily: "Inter_500Medium" },
    sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 10,
      gap: 12,
    },
    cardIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    cardBody: { flex: 1 },
    cardLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
    cardValue: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium", marginTop: 2 },
    cardActions: { flexDirection: "row", alignItems: "center" },
    actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.muted, borderRadius: 8 },
    actionBtnText: { fontSize: 12, color: colors.primary, fontFamily: "Inter_500Medium" },
  });
}
