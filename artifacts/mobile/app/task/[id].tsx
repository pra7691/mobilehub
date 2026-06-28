import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetTask } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/LanguageContext";

import { PermissionGate } from "@/components/PermissionGate";
import { useTaskPermissions } from "@/hooks/useTaskPermissions";
import type { CollectionType } from "@/lib/drafts";

const TYPE_CONFIG: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  VIDEO: { bg: "#2d1b69", text: "#c4b5fd", icon: "Video", label: "Video" },
  IMAGE: { bg: "#1e3a5f", text: "#93c5fd", icon: "Photo", label: "Photo" },
  AUDIO: { bg: "#451a03", text: "#fdba74", icon: "Audio", label: "Audio" },
};

const CAPTURE_ROUTE: Record<string, string> = {
  VIDEO: "/capture/video",
  IMAGE: "/capture/image",
  AUDIO: "/capture/audio",
};

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function DoItem({ text }: { text: string }) {
  return (
    <View style={styles.listItem}>
      <Text style={styles.doIcon}>✓</Text>
      <Text style={styles.doText}>{text}</Text>
    </View>
  );
}

function DontItem({ text }: { text: string }) {
  return (
    <View style={styles.listItem}>
      <Text style={styles.dontIcon}>✗</Text>
      <Text style={styles.dontText}>{text}</Text>
    </View>
  );
}

function RequirementRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reqRow}>
      <Text style={styles.reqLabel}>{label}</Text>
      <Text style={styles.reqValue}>{value}</Text>
    </View>
  );
}

function StartTaskButton({
  collectionType,
  taskId,
  typeConf,
}: {
  collectionType: CollectionType;
  taskId: string;
  typeConf: { icon: string };
}) {
  const router = useRouter();
  const { granted, request } = useTaskPermissions(collectionType);
  const [checkingPermission, setCheckingPermission] = useState(false);
  const [showPermissionGate, setShowPermissionGate] = useState(false);

  if (showPermissionGate) {
    return (
      <PermissionGate
        collectionType={collectionType}
        onRetry={async () => {
          const ok = await request();
          if (ok) {
            setShowPermissionGate(false);
            const route = CAPTURE_ROUTE[collectionType];
            if (route) router.push(`${route}?taskId=${taskId}` as Parameters<typeof router.push>[0]);
          }
        }}
      />
    );
  }

  const handlePress = async () => {
    setCheckingPermission(true);
    let ok = granted;
    if (!ok) {
      ok = await request();
    }
    setCheckingPermission(false);
    if (!ok) {
      setShowPermissionGate(true);
      return;
    }
    const route = CAPTURE_ROUTE[collectionType];
    if (route) router.push(`${route}?taskId=${taskId}` as Parameters<typeof router.push>[0]);
  };

  return (
    <TouchableOpacity
      style={styles.ctaBtn}
      activeOpacity={0.8}
      onPress={handlePress}
      disabled={checkingPermission}
    >
      {checkingPermission ? (
        <ActivityIndicator color="#22d3ee" size="small" />
      ) : (
        <Text style={styles.ctaBtnText}>{typeConf.icon}  Start Task</Text>
      )}
    </TouchableOpacity>
  );
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { data: task, isLoading, error } = useGetTask(id, { language: language as any });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#06b6d4" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!task || error) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Task not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const typeConf = TYPE_CONFIG[task.collectionType] ?? TYPE_CONFIG.IMAGE!;
  const isVideoOrAudio = task.collectionType === "VIDEO" || task.collectionType === "AUDIO";
  const isImage = task.collectionType === "IMAGE";

  const hasRequirements =
    (isVideoOrAudio &&
      (task.minimumDurationSeconds != null || task.maximumDurationSeconds != null)) ||
    (isImage &&
      (task.minimumImageCount != null || task.maximumImageCount != null)) ||
    task.preferredCamera !== "ANY" ||
    task.preferredLens !== "ANY" ||
    task.requiredOrientation !== "ANY" ||
    task.minimumFps != null ||
    task.preferredFps != null ||
    task.audioRequired;

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={[styles.typeBadge, { backgroundColor: typeConf.bg }]}>
              <Text style={styles.typeBadgeIcon}>{typeConf.icon}</Text>
              <Text style={[styles.typeBadgeText, { color: typeConf.text }]}>
                {task.collectionType}
              </Text>
            </View>
            {task.status !== "active" && (
              <View
                style={[
                  styles.statusBadge,
                  task.status === "draft" ? styles.statusDraft : styles.statusInactive,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    task.status === "draft" ? styles.statusTextDraft : styles.statusTextInactive,
                  ]}
                >
                  {task.status.toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{task.title}</Text>

          <View style={styles.breadcrumb}>
            <Text style={styles.breadcrumbText}>
              {task.category?.icon} {task.category?.name}
            </Text>
            {task.subcategory && (
              <>
                <Text style={styles.breadcrumbSep}>›</Text>
                <Text style={styles.breadcrumbText}>{task.subcategory.name}</Text>
              </>
            )}
          </View>

          <View style={styles.paymentRow}>
            <View style={styles.paymentCard}>
              <Text style={styles.paymentLabel}>Your Earnings</Text>
              <Text style={styles.paymentAmount}>₹{task.paymentAmount}</Text>
              <Text style={styles.paymentCurrency}>{task.currency} per submission</Text>
            </View>
          </View>
        </View>

        {task.description ? (
          <View style={styles.section}>
            <SectionHeader title="Overview" />
            <Text style={styles.description}>{task.description}</Text>
          </View>
        ) : null}

        {task.detailedInstructions ? (
          <View style={styles.section}>
            <SectionHeader title="Instructions" />
            <Text style={styles.instructions}>{task.detailedInstructions}</Text>
          </View>
        ) : null}

        {task.dos && task.dos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="✓  Do's" />
            <View style={styles.listContainer}>
              {task.dos.map((d, i) => (
                <DoItem key={i} text={d} />
              ))}
            </View>
          </View>
        ) : null}

        {task.donts && task.donts.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="✗  Don'ts" />
            <View style={styles.listContainer}>
              {task.donts.map((d, i) => (
                <DontItem key={i} text={d} />
              ))}
            </View>
          </View>
        ) : null}

        {hasRequirements ? (
          <View style={styles.section}>
            <SectionHeader title="Requirements" />
            <View style={styles.reqContainer}>
              {isVideoOrAudio && task.minimumDurationSeconds != null && (
                <RequirementRow
                  label="Minimum Duration"
                  value={`${task.minimumDurationSeconds} seconds`}
                />
              )}
              {isVideoOrAudio && task.maximumDurationSeconds != null && (
                <RequirementRow
                  label="Maximum Duration"
                  value={`${task.maximumDurationSeconds} seconds`}
                />
              )}
              {isImage && task.minimumImageCount != null && (
                <RequirementRow
                  label="Minimum Photos"
                  value={String(task.minimumImageCount)}
                />
              )}
              {isImage && task.maximumImageCount != null && (
                <RequirementRow
                  label="Maximum Photos"
                  value={String(task.maximumImageCount)}
                />
              )}
              {task.preferredCamera !== "ANY" && (
                <RequirementRow
                  label="Camera"
                  value={
                    task.preferredCamera === "REAR"
                      ? "Rear (Back) Camera"
                      : "Front (Selfie) Camera"
                  }
                />
              )}
              {task.preferredLens !== "ANY" && (
                <RequirementRow
                  label="Lens"
                  value={task.preferredLens === "ULTRA_WIDE" ? "Ultra Wide" : "Standard"}
                />
              )}
              {task.requiredOrientation !== "ANY" && (
                <RequirementRow
                  label="Orientation"
                  value={
                    task.requiredOrientation === "PORTRAIT"
                      ? "Portrait (Vertical)"
                      : "Landscape (Horizontal)"
                  }
                />
              )}
              {task.minimumFps != null && (
                <RequirementRow label="Minimum FPS" value={String(task.minimumFps)} />
              )}
              {task.audioRequired && (
                <RequirementRow label="Audio" value="Required" />
              )}
              <RequirementRow
                label="Pause During Task"
                value={task.pauseAllowed ? "Allowed" : "Not Allowed"}
              />
            </View>
          </View>
        ) : null}

        {(task.maxSubmissionsPerUser != null ||
          task.maxTotalSubmissions != null ||
          task.startDate ||
          task.endDate) ? (
          <View style={styles.section}>
            <SectionHeader title="Limits" />
            <View style={styles.reqContainer}>
              {task.maxSubmissionsPerUser != null && (
                <RequirementRow
                  label="Your Max Submissions"
                  value={String(task.maxSubmissionsPerUser)}
                />
              )}
              {task.maxTotalSubmissions != null && (
                <RequirementRow
                  label="Total Capacity"
                  value={String(task.maxTotalSubmissions)}
                />
              )}
              {task.startDate && (
                <RequirementRow
                  label="Available From"
                  value={new Date(task.startDate).toLocaleDateString()}
                />
              )}
              {task.endDate && (
                <RequirementRow
                  label="Deadline"
                  value={new Date(task.endDate).toLocaleDateString()}
                />
              )}
            </View>
          </View>
        ) : null}

      </ScrollView>

      {/* Fixed bottom CTA — padded for home indicator on curved phones */}
      {task.status === "active" ? (
        <View style={[styles.ctaSection, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}>
          <StartTaskButton
            collectionType={task.collectionType as CollectionType}
            taskId={id}
            typeConf={typeConf}
          />
        </View>
      ) : (
        <View style={[styles.ctaSection, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}>
          <View style={[styles.ctaBtn, styles.ctaBtnDisabled]}>
            <Text style={[styles.ctaBtnText, styles.ctaBtnTextDisabled]}>
              Task not available
            </Text>
          </View>
          <Text style={styles.ctaNote}>This task is currently {task.status}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  backBtn: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  backText: { fontSize: 16, color: "#06b6d4", fontFamily: "Inter_500Medium" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "#9ca3af", fontFamily: "Inter_400Regular", fontSize: 16 },
  scrollContent: { paddingBottom: 24 },

  hero: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  typeBadgeIcon: { fontSize: 14 },
  typeBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusDraft: { backgroundColor: "#422006" },
  statusInactive: { backgroundColor: "#1c1c1c" },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  statusTextDraft: { color: "#fbbf24" },
  statusTextInactive: { color: "#6b7280" },

  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    lineHeight: 30,
    marginBottom: 8,
  },
  breadcrumb: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  breadcrumbText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6b7280" },
  breadcrumbSep: { color: "#374151", fontSize: 12 },

  paymentRow: {},
  paymentCard: {
    backgroundColor: "#0c2033",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#164e63",
  },
  paymentLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#0891b2",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  paymentAmount: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#06b6d4" },
  paymentCurrency: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#0891b2", marginTop: 2 },

  section: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#141414",
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },

  description: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#d1d5db", lineHeight: 24 },
  instructions: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#9ca3af", lineHeight: 22 },

  listContainer: { gap: 10 },
  listItem: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  doIcon: {
    color: "#22c55e",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginTop: 1,
    width: 16,
  },
  doText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: "#d1d5db", lineHeight: 21 },
  dontIcon: {
    color: "#ef4444",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginTop: 1,
    width: 16,
  },
  dontText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#d1d5db",
    lineHeight: 21,
  },

  reqContainer: {
    backgroundColor: "#141414",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1f1f1f",
  },
  reqRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  reqLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#9ca3af", flex: 1 },
  reqValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#ffffff", textAlign: "right" },

  ctaSection: { padding: 20, paddingTop: 16, alignItems: "center", borderTopWidth: 1, borderTopColor: "#1a1a1a", backgroundColor: "#0a0a0a" },
  ctaBtn: {
    backgroundColor: "#164e63",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignSelf: "center",
    alignItems: "center",
    minHeight: 52,
    minWidth: 200,
    justifyContent: "center",
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#22d3ee", letterSpacing: 0.3 },
  ctaBtnTextDisabled: { color: "#6b7280" },
  ctaNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6b7280",
    marginTop: 10,
  },
});
