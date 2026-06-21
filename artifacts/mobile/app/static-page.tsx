import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useGetPublicPage } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface StaticPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
  version: number;
  updatedAt: string;
}

export default function StaticPageScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data: page, isLoading, isError } = useGetPublicPage(slug ?? "") as {
    data: StaticPage | undefined;
    isLoading: boolean;
    isError: boolean;
  };

  const styles = makeStyles(colors);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {isLoading ? "Loading…" : page?.title ?? "Page"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError || !page ? (
        <View style={styles.centered}>
          <Feather name="file" size={48} color={colors.mutedForeground} />
          <Text style={styles.errorTitle}>Page not found</Text>
          <Text style={styles.errorSub}>This page is not available or has been unpublished.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{page.title}</Text>
          <Text style={styles.meta}>
            Last updated: {new Date(page.updatedAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
            {"  ·  "}v{page.version}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.body}>{page.content}</Text>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { width: 40, height: 40, justifyContent: "center" },
    topBarTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1, textAlign: "center" },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginTop: 16 },
    errorSub: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8 },
    content: { padding: 20 },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -0.5 },
    meta: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 6 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 20 },
    body: { fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 26, letterSpacing: 0.1 },
  });
}
