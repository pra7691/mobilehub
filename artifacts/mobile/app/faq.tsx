import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGetPublicFaq } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
  isActive: boolean;
}

export default function FaqScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language, t } = useLanguage();

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: faqs = [], isLoading, isError } = useGetPublicFaq(
    { ...(search ? { search } : {}), language: language as any },
  ) as { data: FaqItem[]; isLoading: boolean; isError: boolean };

  function toggleItem(id: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const styles = makeStyles(colors);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{t("faq.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={colors.mutedForeground} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("faq.searchPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{t("errors.loadFailed")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {faqs.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="help-circle" size={40} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>
                {search ? `No results for "${search}"` : t("faq.empty")}
              </Text>
            </View>
          ) : (
            faqs.map((faq) => {
              const isOpen = expandedId === faq.id;
              return (
                <TouchableOpacity
                  key={faq.id}
                  style={[styles.item, isOpen && styles.itemOpen]}
                  onPress={() => toggleItem(faq.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemHeader}>
                    <Text style={styles.question}>{faq.question}</Text>
                    <Feather
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.primary}
                      style={styles.chevron}
                    />
                  </View>
                  {isOpen && (
                    <Text style={styles.answer}>{faq.answer}</Text>
                  )}
                </TouchableOpacity>
              );
            })
          )}
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
    topBarTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      margin: 16,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    searchIcon: { marginRight: 2 },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    list: { paddingHorizontal: 16 },
    centered: { alignItems: "center", justifyContent: "center", paddingTop: 60 },
    emptyText: { color: colors.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
    item: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 8,
    },
    itemOpen: { borderColor: colors.primary },
    itemHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    question: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, lineHeight: 22 },
    chevron: { marginTop: 2, flexShrink: 0 },
    answer: { marginTop: 12, fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 22 },
  });
}
