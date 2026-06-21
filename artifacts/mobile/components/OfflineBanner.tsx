import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useNetworkStatus } from "@/contexts/NetworkContext";

const BANNER_HEIGHT = 36;

export function OfflineBanner() {
  const { isOffline, justCameOnline } = useNetworkStatus();
  const { top } = useSafeAreaInsets();

  // "offline" | "back-online" | null
  const [display, setDisplay] = useState<"offline" | "back-online" | null>(null);
  const translateY = useRef(new Animated.Value(-BANNER_HEIGHT)).current;
  const stateRef = useRef<"hidden" | "offline" | "back-online">("hidden");

  function slideIn() {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }

  function slideOut(cb?: () => void) {
    Animated.timing(translateY, {
      toValue: -BANNER_HEIGHT,
      duration: 300,
      useNativeDriver: true,
    }).start(() => cb?.());
  }

  useEffect(() => {
    if (isOffline && stateRef.current !== "offline") {
      stateRef.current = "offline";
      setDisplay("offline");
      slideIn();
    } else if (justCameOnline && stateRef.current === "offline") {
      stateRef.current = "back-online";
      setDisplay("back-online");
      // Stay visible as green for 2 s then slide away
      setTimeout(() => {
        slideOut(() => {
          stateRef.current = "hidden";
          setDisplay(null);
        });
      }, 2000);
    } else if (!isOffline && !justCameOnline && stateRef.current === "offline") {
      slideOut(() => {
        stateRef.current = "hidden";
        setDisplay(null);
      });
    }
  }, [isOffline, justCameOnline]);

  return (
    <Animated.View
      style={[
        styles.banner,
        { top },
        display === "back-online" ? styles.online : styles.offline,
        { transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <Feather
        name={display === "back-online" ? "wifi" : "wifi-off"}
        size={13}
        color="#fff"
        style={styles.icon}
      />
      <Text style={styles.text}>
        {display === "back-online" ? "Back online" : "No internet connection"}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    height: BANNER_HEIGHT,
    zIndex: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 6,
  },
  offline: {
    backgroundColor: "#1f2937",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#374151",
  },
  online: {
    backgroundColor: "#065f46",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#047857",
  },
  icon: { marginTop: 1 },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
