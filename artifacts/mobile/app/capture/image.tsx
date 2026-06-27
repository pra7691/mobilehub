import { Feather } from "@expo/vector-icons";
import { CameraView, type CameraType, type FlashMode } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetTask } from "@workspace/api-client-react";

import { PermissionGate } from "@/components/PermissionGate";
import { useTaskPermissions } from "@/hooks/useTaskPermissions";
import { setPendingCapture } from "@/lib/captureStore";
import {
  saveDraft,
  copyMediaToDrafts,
  generateDraftId,
  DRAFTS_DIR,
  type LocalDraft,
} from "@/lib/drafts";

export default function ImageCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data: task } = useGetTask(taskId ?? "");
  const { granted, request } = useTaskPermissions("IMAGE");

  const cameraRef = useRef<CameraView>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [flash, setFlash] = useState<FlashMode>("off");
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");

  // Gate CameraView on focus so camera hardware releases whenever
  // the route leaves the stack (belt-and-suspenders beyond the push→replace fix).
  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const minCount = task?.minimumImageCount ?? 1;
  const maxCount = task?.maximumImageCount ?? 10;
  const preferredCamera = task?.preferredCamera ?? "ANY";
  const canToggleCamera = preferredCamera === "ANY";

  useEffect(() => {
    if (!task) return;
    if (task.preferredCamera === "FRONT") setFacing("front");
    else if (task.preferredCamera === "REAR") setFacing("back");
  }, [task?.preferredCamera]);

  // Refs that stay current inside AppState callback (no stale closure)
  const taskRef  = useRef(task);
  const photosRef = useRef(photos);
  useEffect(() => { taskRef.current = task; },   [task]);
  useEffect(() => { photosRef.current = photos; }, [photos]);

  // When the app is backgrounded while capturing photos, copy the photos
  // captured so far to the persistent drafts directory and save a LOCAL_READY
  // draft. This ensures the photos survive a process kill.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        const t        = taskRef.current;
        const current  = photosRef.current;
        const minC     = t?.minimumImageCount ?? 1;
        if (!t || !taskId || current.length < minC) return;

        void (async () => {
          try {
            // URIs persisted immediately after capture are already in DRAFTS_DIR;
            // only copy temp URIs (copy failure fallback from handleCapture).
            const persistedUris = await Promise.all(
              current.map(async (uri, i) => {
                if (uri.startsWith(DRAFTS_DIR)) return uri;
                const ext = uri.split(".").pop() ?? "jpg";
                return copyMediaToDrafts(uri, `img_${Date.now()}_${i}.${ext}`);
              })
            );
            const draft: LocalDraft = {
              id: generateDraftId(),
              taskId,
              taskTitle: t.title,
              collectionType: "IMAGE",
              paymentAmount: t.paymentAmount ?? 0,
              currency: "USD",
              mediaUris: persistedUris,
              createdAt: new Date().toISOString(),
              uploadStatus: "LOCAL_READY",
              completedParts: [],
              retryCount: 0,
            };
            await saveDraft(draft);
          } catch {
            // Non-fatal — app is going to background regardless
          }
        })();
      }
    });
    return () => sub.remove();
  }, [taskId]);

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
        // Immediately persist each photo to the drafts directory so it survives
        // a process kill before the session is completed. The original temp file
        // is removed after a successful copy to avoid double disk usage.
        let uri = photo.uri;
        try {
          const ext = photo.uri.split(".").pop() ?? "jpg";
          const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
          uri = await copyMediaToDrafts(photo.uri, filename);
          void FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => {});
        } catch {
          // Copy failed — keep temp URI; AppState handler will copy on background
        }
        setPhotos((prev) => [...prev, uri]);
      }
    } catch {
      Alert.alert("Capture failed", "Please try again.");
    }
    setCapturing(false);
  }, [capturing, photos.length, maxCount]);

  const removePhoto = useCallback(async (index: number) => {
    const uri = photosRef.current[index];
    if (uri) {
      void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
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
    // replace (not push) so the camera screen is removed from the stack —
    // prevents the camera preview from staying alive behind the review screen.
    router.replace(`/capture/review?taskId=${taskId ?? ""}`);
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
      {/* CameraView only mounts while this route is focused so the camera
          hardware releases if the route is ever left in the stack. */}
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
        />
      )}

      {/* Top bar — uses explicit insets so close/flash buttons are always
          below the Dynamic Island / notch / status bar on all devices. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
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
      </View>

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
                  onPress={() => void removePhoto(idx)}
                >
                  <Feather name="x" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom controls — paddingBottom uses insets.bottom so shutter sits
          above the home indicator on all devices. */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
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
      </View>
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
