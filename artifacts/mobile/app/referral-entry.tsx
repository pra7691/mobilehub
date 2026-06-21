import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useValidateReferralCode, useApplyReferralCode } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Feather } from "@expo/vector-icons";

const REFERRAL_PROMPTED_KEY = (userId: string) => `capto_referral_prompted_${userId}`;

async function storeGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function storeSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") { localStorage.setItem(key, value); return; }
  return SecureStore.setItemAsync(key, value);
}

export async function markReferralPrompted(userId: string) {
  await storeSet(REFERRAL_PROMPTED_KEY(userId), "1");
}

export async function hasBeenPrompted(userId: string): Promise<boolean> {
  const val = await storeGet(REFERRAL_PROMPTED_KEY(userId));
  return val === "1";
}

export default function ReferralEntryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const { user } = useAuth() as { user?: { id: string } | null };

  const [code, setCode] = useState("");
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  const validateMutation = useValidateReferralCode();
  const applyMutation = useApplyReferralCode();

  const styles = makeStyles(colors);

  async function dismiss() {
    if (user?.id) await markReferralPrompted(user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.replace("/(tabs)/" as any);
  }

  function handleCodeChange(text: string) {
    const numeric = text.replace(/\D/g, "").slice(0, 6);
    setCode(numeric);
    setValidationMsg(null);
    setIsValid(null);
    if (numeric.length === 6) {
      validateMutation.mutate(
        { data: { referralCode: numeric } },
        {
          onSuccess: (res) => {
            const r = res as { valid: boolean; message: string };
            setIsValid(r.valid);
            setValidationMsg(r.message);
          },
          onError: () => {
            setIsValid(false);
            setValidationMsg(t("referral.invalidCode"));
          },
        }
      );
    }
  }

  async function handleApply() {
    if (!isValid || code.length !== 6) return;
    applyMutation.mutate(
      { data: { referralCode: code } },
      {
        onSuccess: async () => {
          if (user?.id) await markReferralPrompted(user.id);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.replace("/(tabs)/" as any);
        },
        onError: (e: unknown) => {
          const msg =
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            t("referral.applyError");
          setValidationMsg(msg);
          setIsValid(false);
        },
      }
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.iconWrap}>
          <Feather name="gift" size={36} color={colors.primary} />
        </View>

        <Text style={styles.title}>{t("referral.entryTitle")}</Text>
        <Text style={styles.subtitle}>{t("referral.entrySubtitle")}</Text>

        <View style={styles.inputWrap}>
          <TextInput
            style={[
              styles.input,
              isValid === true && { borderColor: "#10b981" },
              isValid === false && { borderColor: colors.destructive },
            ]}
            value={code}
            onChangeText={handleCodeChange}
            placeholder={t("referral.codePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
            maxLength={6}
            autoFocus
          />
          {validateMutation.isPending && (
            <ActivityIndicator
              style={styles.inputSpinner}
              size="small"
              color={colors.primary}
            />
          )}
        </View>

        {validationMsg && (
          <Text style={[styles.validationMsg, isValid ? styles.validMsg : styles.invalidMsg]}>
            {validationMsg}
          </Text>
        )}

        <TouchableOpacity
          style={[
            styles.applyBtn,
            (!isValid || applyMutation.isPending) && styles.applyBtnDisabled,
          ]}
          onPress={handleApply}
          disabled={!isValid || applyMutation.isPending}
          activeOpacity={0.8}
        >
          {applyMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.applyBtnText}>{t("referral.applyCode")}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={dismiss} activeOpacity={0.7}>
          <Text style={styles.skipText}>{t("referral.skip")}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: "center",
      paddingHorizontal: 28,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary + "20",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 28,
    },
    inputWrap: {
      width: "100%",
      position: "relative",
      marginBottom: 8,
    },
    input: {
      width: "100%",
      height: 52,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 16,
      fontSize: 20,
      letterSpacing: 6,
      color: colors.foreground,
      backgroundColor: colors.card,
      textAlign: "center",
      fontFamily: "Inter_600SemiBold",
    },
    inputSpinner: {
      position: "absolute",
      right: 14,
      top: 14,
    },
    validationMsg: {
      fontSize: 12,
      marginBottom: 16,
      textAlign: "center",
    },
    validMsg: {
      color: "#10b981",
    },
    invalidMsg: {
      color: colors.destructive,
    },
    applyBtn: {
      width: "100%",
      height: 50,
      backgroundColor: colors.primary,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    applyBtnDisabled: {
      opacity: 0.45,
    },
    applyBtnText: {
      color: colors.primaryForeground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
    },
    skipBtn: {
      marginTop: 16,
      padding: 10,
    },
    skipText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
  });
}
