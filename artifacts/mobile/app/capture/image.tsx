import { Feather } from "@expo/vector-icons";
import { CameraView, type CameraType, type FlashMode } from "expo-camera";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGetTask } from "@workspace/api-client-react";

import { PermissionGate } from "@/components/PermissionGate";
import { useTaskPermissions } from "@/hooks/useTaskPermissions";
import { setPendingCapture } from "@/lib/captureStore";

export default function ImageCaptureScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data: task } = useGetTask(taskId ?? "");
  const { granted, request } = useTaskPermissions("IMAGE");

  const cameraRef = useRef<CameraView>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [flash, setFlash] = useState<FlashMode>("off");
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");

  const minCount = task?.minimumImageCount ?? 1;
  const maxCount = task?.maximumImageCount ?? 10;
  const preferredCamera = task?.preferredCamera ?? "ANY";
  const canToggleCamera = preferredCamera === "ANY";

  // Sync facing with task preferred camera once task data arrives
  useEffect(() => {
    if (!task) return;
    if (task.preferredCamera === "FRONT") setFacing("front");
    else if (task.preferredCamera === "REAR") setFacing("back");
  }, [task?.preferredCamera]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    if (photos.length >= maxCount) {
      Alert.alert("Limit reached", `Maximum ${maxCount} photos allowed.`);
      return;
    }
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        setPhotos((prev) => [...prev, photo.uri]);
      }
    } catch {
      Alert.alert("Capture failed", "Please try again.");
    }
    setCapturing(false);
  }, [capturing, photos.length, maxCount]);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleContinue = useCallback(() => {
    if (photos.length < minCount) {
      Alert.alert(
        "Not enough photos",
        `Please capture at least ${minCount} photo${minCount > 1 ? "s" : ""}.`
      );
      return;
    }
    setPendingCapture({
      taskId: taskId ?? "",
      collectionType: "IMAGE",
      mediaUris: photos,
    });
    router.push(`/capture/review?taskId=${taskId ?? ""}`);
  }, [photos, minCount, taskId, router]);

  const handleClose = useCallback(() => {
    if (photos.length > 0) {
      Alert.alert("Discard Photos?", "Your captured photos will be lost.", [
        { text: "Keep", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  }, [photos.length, router]);

  if (!granted) {
    return (
      <PermissionGate
        collectionType="IMAGE"
        onRetry={() => void request()}
      />
    );
  }

  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.webNote}>
          Camera capture is not supported on web. Please use the mobile app.
        </Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
      />

      {/* Top bar */}
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={handleClose}>
          <Feather name="x" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {photos.length} / {maxCount}
          </Text>
          {minCount > 0 && photos.length < minCount && (
            <Text style={styles.minText}>min {minCount} required</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setFlash((f) => (f === "off" ? "on" : "off"))}
        >
          <Feather
            name={flash === "on" ? "zap" : "zap-off"}
            size={22}
            color="#fff"
          />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Thumbnail strip */}
      {photos.length > 0 && (
        <View style={styles.stripContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            {photos.map((uri, idx) => (
              <View key={idx} style={styles.thumb}>
                <Image source={{ uri }} style={styles.thumbImg} contentFit="cover" />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removePhoto(idx)}
                >
                  <Feather name="x" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom controls */}
      <SafeAreaView edges={["bottom"]} style={styles.bottomBar}>
        {canToggleCamera ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          >
            <Feather name="refresh-cw" size={22} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}

        <TouchableOpacity
          style={[styles.shutterBtn, capturing && styles.shutterBtnCapturing]}
          onPress={handleCapture}
          disabled={capturing}
          activeOpacity={0.8}
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.continueBtn,
            photos.length < minCount && styles.continueBtnDisabled,
          ]}
          onPress={handleContinue}
          disabled={photos.length < minCount}
        >
          <Feather
            name="check"
            size={20}
            color={photos.length >= minCount ? "#06b6d4" : "#4b5563"}
          />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 22,
  },
  countBadge: {
    alignItems: "center",
    gap: 2,
  },
  countText: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  minText: {
    color: "#fbbf24",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  stripContainer: {
    position: "absolute",
    bottom: 140,
    left: 0,
    right: 0,
  },
  strip: {
    paddingHorizontal: 12,
    gap: 8,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: "hidden",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  removeBtn: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    paddingBottom: 40,
    paddingTop: 20,
  },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterBtnCapturing: {
    borderColor: "#06b6d4",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  continueBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(6,182,212,0.15)",
    borderWidth: 2,
    borderColor: "#06b6d4",
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnDisabled: {
    borderColor: "#374151",
    backgroundColor: "rgba(55,65,81,0.2)",
  },
  webNote: {
    color: "#9ca3af",
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    padding: 40,
  },
  closeBtn: {
    alignSelf: "center",
    backgroundColor: "#164e63",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  closeBtnText: {
    color: "#06b6d4",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
