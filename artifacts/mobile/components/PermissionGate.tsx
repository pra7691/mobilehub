import { Feather } from "@expo/vector-icons";
import { Linking } from "react-native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { CollectionType } from "@/lib/drafts";

interface PermissionGateProps {
  collectionType: CollectionType;
  onRetry: () => void;
}

const COPY: Record<
  CollectionType,
  { icon: string; title: string; reason: string }
> = {
  IMAGE: {
    icon: "camera",
    title: "Camera Permission Required",
    reason:
      "Capto needs access to your camera to capture photo evidence for this task. Your photos are only saved locally until you choose to upload.",
  },
  VIDEO: {
    icon: "video",
    title: "Camera & Microphone Required",
    reason:
      "Capto needs access to your camera and microphone to record video evidence for this task. Videos are saved locally until you choose to upload.",
  },
  AUDIO: {
    icon: "mic",
    title: "Microphone Permission Required",
    reason:
      "Capto needs access to your microphone to record audio evidence for this task. Recordings are saved locally until you choose to upload.",
  },
};

export function PermissionGate({
  collectionType,
  onRetry,
}: PermissionGateProps) {
  const copy = COPY[collectionType];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Feather name={copy.icon as "camera" | "video" | "mic"} size={40} color="#06b6d4" />
        </View>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.reason}>{copy.reason}</Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={onRetry} activeOpacity={0.8}>
          <Feather name="shield" size={16} color="#0f1117" />
          <Text style={styles.primaryBtnText}>Grant Permission</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => void Linking.openSettings()}
          activeOpacity={0.7}
        >
          <Feather name="settings" size={16} color="#94a3b8" />
          <Text style={styles.secondaryBtnText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 16,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#0c2033",
    borderWidth: 1,
    borderColor: "#164e63",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    textAlign: "center",
  },
  reason: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#06b6d4",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#0f1117",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#94a3b8",
  },
});
