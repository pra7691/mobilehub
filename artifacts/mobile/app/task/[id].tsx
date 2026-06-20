import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useGetTask, getGetTaskQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  reward: number;
  status: string;
  category?: { name: string } | null;
  subcategory?: { name: string } | null;
}

export default function TaskDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: task, isLoading } = useGetTask(id, {
    query: { enabled: !!id, queryKey: getGetTaskQueryKey(id) },
  }) as { data: Task | undefined; isLoading: boolean };

  async function handleSubmit() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Submit Task", "Camera upload will be available in a future update.", [{ text: "OK" }]);
  }

  const styles = makeStyles(colors);

  if (isLoading || !task) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()} testID="button-back">
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          {task.category && (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryText}>{task.category.name}</Text>
            </View>
          )}
          {task.subcategory && (
            <View style={styles.subcatTag}>
              <Text style={styles.subcatText}>{task.subcategory.name}</Text>
            </View>
          )}
        </View>

        <Text style={styles.title}>{task.title}</Text>

        <View style={styles.rewardBox}>
          <Feather name="award" size={20} color={colors.primary} />
          <Text style={styles.rewardText}>₹{task.reward} reward</Text>
        </View>

        {task.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.sectionBody}>{task.description}</Text>
          </View>
        )}

        {task.instructions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <Text style={styles.sectionBody}>{task.instructions}</Text>
          </View>
        )}

        <View style={[styles.uploadBox]}>
          <Feather name="camera" size={32} color={colors.mutedForeground} />
          <Text style={styles.uploadTitle}>Upload your submission</Text>
          <Text style={styles.uploadSubtext}>Take a photo or upload from gallery</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} testID="button-submit">
          <Feather name="upload" size={18} color={colors.primaryForeground} />
          <Text style={styles.submitText}>Submit Task</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
    back: { paddingHorizontal: 20, paddingBottom: 8, width: 52 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 120, gap: 20 },
    topRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    categoryTag: { backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    categoryText: { fontSize: 12, color: colors.primary, fontFamily: "Inter_600SemiBold" },
    subcatTag: { backgroundColor: colors.muted, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    subcatText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.5 },
    rewardBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignSelf: "flex-start" },
    rewardText: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.primary },
    section: { gap: 8 },
    sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.5, textTransform: "uppercase" },
    sectionBody: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 24 },
    uploadBox: {
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: "dashed",
      borderRadius: 16,
      padding: 32,
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.muted,
    },
    uploadTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    uploadSubtext: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
      paddingTop: 16,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    submitText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
  });
}
