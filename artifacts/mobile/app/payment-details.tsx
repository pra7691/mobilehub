import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useGetPaymentMethodsMe,
  usePostPaymentMethodsUpi,
  usePatchPaymentMethodsUpiId,
  getGetPaymentMethodsMeQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";

function validateUpiId(upiId: string): string | null {
  const trimmed = upiId.trim();
  const at = trimmed.indexOf("@");
  if (at < 1 || at === trimmed.length - 1 || trimmed.includes(" ")) {
    return "Invalid UPI ID. Example: name@upi";
  }
  return null;
}

export default function PaymentDetailsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const styles = makeStyles(colors);

  const { data: methods, isLoading } = useGetPaymentMethodsMe();
  const method = methods?.[0];

  const addMutation = usePostPaymentMethodsUpi();
  const updateMutation = usePatchPaymentMethodsUpiId();

  const [editing, setEditing] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [upiError, setUpiError] = useState("");

  const isPending = addMutation.isPending || updateMutation.isPending;

  async function handleSave() {
    const trimmed = upiId.trim();
    const err = validateUpiId(trimmed);
    if (err) { setUpiError(err); return; }

    try {
      if (method) {
        await updateMutation.mutateAsync({ id: method.id, data: { upiId: trimmed } });
      } else {
        await addMutation.mutateAsync({ data: { upiId: trimmed } });
      }
      await qc.invalidateQueries({ queryKey: getGetPaymentMethodsMeQueryKey() });
      setEditing(false);
      setUpiId("");
    } catch (e: unknown) {
      Alert.alert("Error", (e as { message?: string })?.message ?? "Failed to save UPI ID");
    }
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerLabel}>ACCOUNT</Text>
          <Text style={styles.headerTitle}>Payment Details</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <>
          {method ? (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.iconBox}>
                  <Feather name="credit-card" size={18} color={colors.primary} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardLabel}>UPI ID</Text>
                  <Text style={styles.cardValue}>{method.upiIdMasked}</Text>
                </View>
              </View>

              {!editing && (
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => { setEditing(true); setUpiId(""); }}
                  activeOpacity={0.7}
                >
                  <Feather name="edit-2" size={14} color={colors.primary} />
                  <Text style={styles.editBtnText}>Update UPI ID</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.empty}>
              <Feather name="credit-card" size={36} color={colors.mutedForeground} />
              <Text style={styles.emptyTitle}>No payment method added</Text>
              <Text style={styles.emptySubtitle}>Add your UPI ID to enable withdrawals</Text>
            </View>
          )}

          {(!method || editing) && (
            <View style={styles.form}>
              <Text style={styles.formTitle}>{method ? "Update UPI ID" : "Add UPI ID"}</Text>
              <Text style={styles.formHint}>
                Enter your UPI ID exactly as registered (e.g. yourname@okicici)
              </Text>
              <TextInput
                style={[styles.input, upiError ? styles.inputError : null]}
                value={upiId}
                onChangeText={(v) => { setUpiId(v); setUpiError(""); }}
                placeholder="e.g. yourname@okicici"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              {upiError ? <Text style={styles.errorText}>{upiError}</Text> : null}

              <View style={styles.btnRow}>
                {editing && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => { setEditing(false); setUpiId(""); setUpiError(""); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.saveBtn, isPending && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={isPending}
                  activeOpacity={0.7}
                >
                  {isPending ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>{method ? "Update" : "Save"}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.infoBox}>
            <Feather name="shield" size={14} color={colors.mutedForeground} />
            <Text style={styles.infoText}>
              Your UPI ID is masked for security. Only the admin can see the full ID during payout processing.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => router.push("/payout-history")}
            activeOpacity={0.7}
          >
            <View style={styles.historyBtnLeft}>
              <View style={styles.historyIconBox}>
                <Feather name="clock" size={16} color={colors.primary} />
              </View>
              <Text style={styles.historyBtnText}>Payout History</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: 60 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 14,
    },
    headerLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, letterSpacing: 1, textTransform: "uppercase" },
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.3 },
    centered: { paddingTop: 80, alignItems: "center" },
    card: {
      margin: 20,
      marginTop: 12,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    iconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    cardInfo: { flex: 1, gap: 2 },
    cardLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    cardValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    editBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    editBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.primary },
    empty: { alignItems: "center", paddingTop: 50, paddingBottom: 20, gap: 8 },
    emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptySubtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 30 },
    form: { marginHorizontal: 20, marginTop: 4, gap: 10 },
    formTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    formHint: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18 },
    input: {
      height: 48,
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    inputError: { borderColor: "#ef4444" },
    errorText: { fontSize: 12, color: "#ef4444", fontFamily: "Inter_400Regular" },
    btnRow: { flexDirection: "row", gap: 10 },
    cancelBtn: { flex: 1, height: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    cancelBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    saveBtn: { flex: 2, height: 46, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    saveBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    infoBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginHorizontal: 20,
      marginTop: 20,
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoText: { flex: 1, fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18 },
    historyBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: 20,
      marginTop: 12,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    historyBtnLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    historyIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    historyBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
  });
}
