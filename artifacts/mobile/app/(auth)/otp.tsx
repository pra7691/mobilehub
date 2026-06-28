import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useVerifyOtp } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useNetworkStatus } from "@/contexts/NetworkContext";

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessionId, phone } = useLocalSearchParams<{ sessionId: string; phone: string }>();
  const { login } = useAuth();
  const verifyOtp = useVerifyOtp();
  const { isOffline } = useNetworkStatus();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const inputs = useRef<(TextInput | null)[]>([]);

  const otpStr = otp.join("");

  useEffect(() => {
    setTimeout(() => inputs.current[0]?.focus(), 300);
  }, []);

  function handleChange(text: string, index: number) {
    const digit = text.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) {
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    if (otpStr.length < OTP_LENGTH) return;
    if (isOffline) {
      Alert.alert("No internet", "Please check your connection and try again.");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    verifyOtp.mutate(
      { data: { sessionId, otp: otpStr } },
      {
        onSuccess: async (tokens) => {
          // --- TEMPORARY DEBUG (remove once root cause is confirmed) ---
          const _apiBase = process.env.EXPO_PUBLIC_API_BASE_URL
            ? process.env.EXPO_PUBLIC_API_BASE_URL.replace(/\/api\/?$/, '')
            : process.env.EXPO_PUBLIC_DOMAIN
              ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
              : '(not set)';
          const _tokType = typeof tokens;
          const _tokKeys = tokens !== null && _tokType === 'object'
            ? Object.keys(tokens as object).join(', ')
            : 'n/a';
          const _t = tokens as unknown as Record<string,unknown>;
          const _hasAT = typeof _t?.accessToken === 'string' && _t.accessToken !== '';
          const _hasRT = typeof _t?.refreshToken === 'string' && _t.refreshToken !== '';
          const _debugMsg = [
            `apiBase: ${_apiBase}`,
            `httpStatus: 2xx (onSuccess fired)`,
            `typeof tokens: ${_tokType}`,
            `keys: ${_tokKeys}`,
            `accessToken non-empty string: ${_hasAT}`,
            `refreshToken non-empty string: ${_hasRT}`,
          ].join('\n');
          console.log('[OTP DEBUG]\n' + _debugMsg);
          Alert.alert('OTP Debug', _debugMsg);
          // --- END TEMPORARY DEBUG ---

          if (!tokens?.accessToken || !tokens?.refreshToken) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(
              "Login response was invalid",
              "The server did not return valid credentials. Please try again."
            );
            return;
          }
          await login(tokens.accessToken, tokens.refreshToken);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.replace("/(tabs)/" as any);
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert("Invalid OTP", "The code you entered is incorrect or expired. Please try again.");
          setOtp(Array(OTP_LENGTH).fill(""));
          inputs.current[0]?.focus();
        },
      }
    );
  }

  const styles = makeStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 32 }]}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()} testID="button-back">
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Enter the code</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{"\n"}
          <Text style={styles.phone}>+91 {phone}</Text>
        </Text>

        {isOffline && (
          <View style={styles.offlineBadge}>
            <Feather name="wifi-off" size={13} color="#9ca3af" />
            <Text style={styles.offlineText}>You're offline — reconnect to verify</Text>
          </View>
        )}

        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={r => { inputs.current[i] = r; }}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
              value={digit}
              onChangeText={t => handleChange(t, i)}
              onKeyPress={e => handleKeyPress(e, i)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              testID={`input-otp-${i}`}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, (otpStr.length < OTP_LENGTH || verifyOtp.isPending) && styles.btnDisabled]}
          onPress={handleVerify}
          disabled={otpStr.length < OTP_LENGTH || verifyOtp.isPending}
          testID="button-verify"
        >
          {verifyOtp.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.btnText}>Verify</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 28 },
    back: { marginBottom: 40, width: 40 },
    content: { gap: 24 },
    title: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.5 },
    subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 22 },
    phone: { fontFamily: "Inter_600SemiBold", color: colors.foreground },
    otpRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
    otpBox: {
      width: 48,
      minWidth: 0,
      height: 58,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.muted,
      textAlign: "center",
      fontSize: 22,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    otpBoxFilled: { borderColor: colors.primary, backgroundColor: colors.accent },
    offlineBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#111827",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: "#1f2937",
    },
    offlineText: {
      fontSize: 13,
      color: "#6b7280",
      fontFamily: "Inter_400Regular",
      flex: 1,
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 17,
      alignItems: "center",
      marginTop: 8,
    },
    btnDisabled: { opacity: 0.4 },
    btnText: { color: colors.primaryForeground, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  });
}
