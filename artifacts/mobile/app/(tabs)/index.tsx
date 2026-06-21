import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, Dimensions, Image, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useListCategories, useGetPublicNotices, useGetApiBanners, useGetApiAppSettingsBanner,
  type Category, type Notice,
} from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";

const SCREEN_WIDTH = Dimensions.get("window").width;
const BANNER_HEIGHT = Math.round(SCREEN_WIDTH * (7 / 16));

// ─── Category Card ───────────────────────────────────────────────────────────
function CategoryCard({ category, onPress, subcategoriesLabel, tasksLabel }: {
  category: Category; onPress: () => void; subcategoriesLabel: string; tasksLabel: string;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardIconContainer}>
        <Text style={styles.cardIcon}>{category.icon || "📁"}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{category.name}</Text>
        {category.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{category.description}</Text>
        ) : null}
        <View style={styles.cardMeta}>
          <View style={styles.metaBadge}>
            <Text style={styles.metaText}>{category.subcategoryCount} {subcategoriesLabel}</Text>
          </View>
          <View style={[styles.metaBadge, styles.metaBadgeTasks]}>
            <Text style={[styles.metaText, styles.metaTextCyan]}>{category.taskCount} {tasksLabel}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.cardArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Notice Banner ────────────────────────────────────────────────────────────
function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: (id: string) => void }) {
  return (
    <View style={styles.noticeBanner}>
      <Feather name="bell" size={14} color="#f59e0b" style={{ marginTop: 1 }} />
      <View style={styles.noticeTextBlock}>
        <Text style={styles.noticeTitle}>{notice.title}</Text>
        <Text style={styles.noticeContent}>{notice.content}</Text>
      </View>
      <TouchableOpacity onPress={() => onDismiss(notice.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={15} color="#92400e" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Banner Skeleton ──────────────────────────────────────────────────────────
function BannerSkeleton() {
  return (
    <View style={styles.bannerContainer}>
      <View style={[styles.bannerSlide, styles.bannerSkeleton]} />
    </View>
  );
}

// ─── Banner Item ──────────────────────────────────────────────────────────────
interface PublicBanner {
  id: string;
  imageUrl: string;
  title?: string | null;
  description?: string | null;
}

function BannerItem({ banner }: { banner: PublicBanner }) {
  const [imgError, setImgError] = useState(false);
  const hasText = !!(banner.title || banner.description);

  return (
    <View style={styles.bannerSlide} pointerEvents="none">
      {!imgError ? (
        <Image
          source={{ uri: banner.imageUrl }}
          style={styles.bannerImage}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={styles.bannerFallback}>
          <Feather name="image" size={28} color="#374151" />
        </View>
      )}
      {hasText && (
        <View style={styles.bannerOverlay}>
          {banner.title ? (
            <Text style={styles.bannerTitle} numberOfLines={2}>{banner.title}</Text>
          ) : null}
          {banner.description ? (
            <Text style={styles.bannerDesc} numberOfLines={2}>{banner.description}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ─── Banner Carousel ──────────────────────────────────────────────────────────
function BannerCarousel({ banners, autoSlideSeconds }: { banners: PublicBanner[]; autoSlideSeconds: number }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const isSwiping = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (banners.length <= 1) return;
    timerRef.current = setInterval(() => {
      if (isSwiping.current) return;
      setCurrentIndex((prev) => {
        const next = (prev + 1) % banners.length;
        flatListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, autoSlideSeconds * 1000);
  }

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length, autoSlideSeconds]);

  function onScrollBegin() {
    isSwiping.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function onScrollEnd() {
    isSwiping.current = false;
    startTimer();
  }

  function onViewableItemsChanged({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }

  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const onViewableItemsChangedRef = useRef(onViewableItemsChanged);

  if (banners.length === 0) return null;

  return (
    <View style={styles.bannerContainer}>
      <FlatList
        ref={flatListRef}
        data={banners}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BannerItem banner={item} />}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={onScrollBegin}
        onMomentumScrollEnd={onScrollEnd}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        viewabilityConfig={viewConfigRef.current}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
      {banners.length > 1 && (
        <View style={styles.dotsContainer}>
          {banners.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CategoriesScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useListCategories({ isActive: true, limit: 50, language: language as any });
  const { data: notices = [] } = useGetPublicNotices({ language: language as any }) as { data: Notice[] };

  const {
    data: bannerData,
    isLoading: bannersLoading,
    refetch: refetchBanners,
    isError: bannersError,
  } = useGetApiBanners({ language: language as any });
  const banners: PublicBanner[] = bannersError ? [] : ((bannerData as PublicBanner[]) ?? []);

  const { data: bannerSettingsData } = useGetApiAppSettingsBanner();
  const autoSlideSeconds: number = (bannerSettingsData as any)?.autoSlideSeconds ?? 5;

  const visibleNotices = (notices as Notice[]).filter((n) => n.isActive && !dismissedNotices.has(n.id));
  const categories = (data?.data ?? []).filter((c) => c.isActive);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchBanners()]);
    setRefreshing(false);
  }, [refetch, refetchBanners]);

  function dismissNotice(id: string) {
    setDismissedNotices((prev) => new Set([...prev, id]));
  }

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Capto</Text>
          <Text style={styles.headerSubtitle}>{t("home.browseCategories")}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#06b6d4" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Capto</Text>
        <Text style={styles.headerSubtitle}>{t("home.browseCategories")}</Text>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />
        }
        ListHeaderComponent={
          <>
            {/* Banners */}
            {bannersLoading ? (
              <BannerSkeleton />
            ) : banners.length > 0 ? (
              <BannerCarousel banners={banners} autoSlideSeconds={autoSlideSeconds} />
            ) : null}

            {/* Notices */}
            {visibleNotices.length > 0 && (
              <View style={styles.noticesList}>
                {visibleNotices.map((n) => (
                  <NoticeBanner key={n.id} notice={n} onDismiss={dismissNotice} />
                ))}
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <CategoryCard
            category={item}
            subcategoriesLabel={t("category.subcategories")}
            tasksLabel={t("category.tasks")}
            onPress={() =>
              router.push({
                pathname: "/category/[id]",
                params: { id: item.id, name: item.name, icon: item.icon ?? "📁" },
              })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyText}>{t("home.noCategories")}</Text>
            <Text style={styles.emptySubtext}>{t("home.noCategoriesSubtitle")}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: "center" },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#ffffff", textAlign: "center" },
  headerSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6b7280", marginTop: 2, textAlign: "center" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Banner carousel
  bannerContainer: { marginBottom: 12 },
  bannerSlide: { width: SCREEN_WIDTH, height: BANNER_HEIGHT, backgroundColor: "#141414" },
  bannerSkeleton: { backgroundColor: "#1a1a1a" },
  bannerImage: { width: "100%", height: "100%" },
  bannerFallback: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#141414" },
  bannerOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  bannerTitle: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#ffffff",
    lineHeight: 20, marginBottom: 2,
  },
  bannerDesc: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.80)",
    lineHeight: 17,
  },
  dotsContainer: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    paddingTop: 8, gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { backgroundColor: "#06b6d4", width: 18 },
  dotInactive: { backgroundColor: "#374151" },

  // Notices
  noticesList: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  noticeBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#422006", borderRadius: 10, borderWidth: 1, borderColor: "#92400e",
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  noticeTextBlock: { flex: 1 },
  noticeTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fbbf24" },
  noticeContent: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#d97706", marginTop: 2, lineHeight: 17 },

  // Category list
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  card: { backgroundColor: "#141414", borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 14, borderWidth: 1, borderColor: "#1f1f1f" },
  cardIconContainer: { width: 56, height: 56, borderRadius: 14, backgroundColor: "#1a1a1a", justifyContent: "center", alignItems: "center", marginRight: 14, borderWidth: 1, borderColor: "#2a2a2a" },
  cardIcon: { fontSize: 28 },
  cardBody: { flex: 1 },
  cardName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#ffffff", marginBottom: 3 },
  cardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6b7280", marginBottom: 8, lineHeight: 17 },
  cardMeta: { flexDirection: "row", gap: 8 },
  metaBadge: { backgroundColor: "#1f1f1f", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#2a2a2a" },
  metaBadgeTasks: { borderColor: "#164e63" },
  metaText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#9ca3af" },
  metaTextCyan: { color: "#22d3ee" },
  cardArrow: { fontSize: 22, color: "#374151", marginLeft: 8 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyText: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#ffffff", marginBottom: 8 },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6b7280", textAlign: "center", lineHeight: 20 },
});
