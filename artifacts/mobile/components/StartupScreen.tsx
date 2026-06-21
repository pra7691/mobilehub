import React from "react";
import { View, Text, Image, StyleSheet, ActivityIndicator } from "react-native";

export function StartupScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={require("../assets/images/icon.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.appName}>Capto</Text>
      <ActivityIndicator
        style={styles.spinner}
        color="#06b6d4"
        size="small"
      />
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 1,
    marginBottom: 32,
  },
  spinner: {
    marginBottom: 10,
  },
  loadingText: {
    fontSize: 13,
    color: "#4b5563",
    letterSpacing: 0.5,
  },
});
