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
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useRequestOtp } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const requestOtp = useRequestOtp();

  function formatPhone(raw: string) {
    const digits = raw.replace(/\D/g, "");
    return digits;
  }

  async function handleContinue() {
    const digits = formatPhone(phone);
    if (digits.length < 10) {
      Alert.alert("Invalid number", "Please enter a valid phone number.");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    requestOtp.mutate(
      { data: { phoneNumber: digits } },
      {
        onSuccess: (result) => {
          router.push({ pathname: "/(auth)/otp", params: { sessionId: result.sessionId, phone: digits } });
        },
        onError: () => {
          Alert.alert("Error", "Failed to send OTP. Please try again.");
        },
      }
    );
  }

  const styles = makeStyles(colors);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 40 }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.logoMark} />
          <Text style={styles.brand}>Capto</Text>
          <Text style={styles.tagline}>Data collection, simplified.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Mobile Number</Text>
          <View style={styles.inputRow}>
            <View style={styles.countryCode}>
              <Text style={styles.countryText}>+91</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Enter your number"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={15}
              autoFocus
              testID="input-phone"
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, requestOtp.isPending && styles.btnDisabled]}
            onPress={handleContinue}
            disabled={requestOtp.isPending || phone.replace(/\D/g, "").length < 10}
            testID="button-continue"
          >
            {requestOtp.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.btnText}>Send OTP</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.disclaimer}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    inner: { flex: 1, paddingHorizontal: 28, justifyContent: "space-between", paddingBottom: 40 },
    header: { alignItems: "center", paddingTop: 160 },
    logoMark: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: colors.primary,
      marginBottom: 16,
    },
    brand: { fontSize: 32, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -1 },
    tagline: { fontSize: 15, color: colors.mutedForeground, marginTop: 6, fontFamily: "Inter_400Regular" },
    form: { gap: 14 },
    label: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground, letterSpacing: 0.5, textTransform: "uppercase" },
    inputRow: { flexDirection: "row", gap: 10 },
    countryCode: {
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 16,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    countryText: { fontSize: 16, color: colors.foreground, fontFamily: "Inter_500Medium" },
    input: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 18,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
      borderWidth: 1,
      borderColor: colors.border,
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 17,
      alignItems: "center",
      marginTop: 6,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: colors.primaryForeground, fontSize: 16, fontFamily: "Inter_600SemiBold" },
    disclaimer: { textAlign: "center", fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18 },
  });
}
