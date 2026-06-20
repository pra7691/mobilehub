import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOfflineBanner } from "@/hooks/useOfflineBanner";

export function OfflineBanner() {
  const { isOffline } = useOfflineBanner();
  const { top } = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-60)).current;
  const visible = useRef(false);

  useEffect(() => {
    if (isOffline && !visible.current) {
      visible.current = true;
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    } else if (!isOffline && visible.current) {
      Animated.timing(translateY, {
        toValue: -60,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        visible.current = false;
      });
    }
  }, [isOffline]);

  return (
    <Animated.View
      style={[
        styles.banner,
        { paddingTop: top + 6, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        <Text style={styles.icon}>📵</Text>
        <Text style={styles.text}>No internet connection</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ef4444",
    zIndex: 999,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  icon: {
    fontSize: 13,
    marginRight: 2,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
