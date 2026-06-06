// Search / discovery list.
//
// Top: search bar + horizontal filter chips (category / price / city).
// Body: vertical FlatList of artist cards with infinite scroll +
//       pull-to-refresh.
// Empty / loading / error all share the same skeleton style so the
// screen never feels broken.
//
// Filter state lives in URL params (via expo-router's useLocalSearchParams)
// so deep links from the home screen ("?category=dj") just work — and
// the back-stack restores filters on swipe-back.

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  TextInput,
  ScrollView,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, X, SlidersHorizontal, Star, Check } from "lucide-react-native";
import { SafeScreen, Card, Avatar, Badge } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { publicApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

interface ArtistListItem {
  id: number;
  nameRo: string;
  slug: string;
  photoUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  isPremium: boolean;
  priceFrom: number | null;
  baseCity: string | null;
  descriptionRo: string | null;
}

interface ArtistListResponse {
  items: ArtistListItem[];
  total: number;
  page: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

// Advanced filters live in local state (not the URL) — they're set via the
// bottom-sheet and feed straight into the artists query params the API
// already supports (sort / price_min / price_max / rating_min / city).
type SortKey = "popular" | "price_asc" | "price_desc" | "rating" | "newest";

interface AdvFilters {
  sort: SortKey | null;
  priceMin: string;
  priceMax: string;
  ratingMin: number | null;
  city: string | null;
}

const EMPTY_ADV: AdvFilters = {
  sort: null,
  priceMin: "",
  priceMax: "",
  ratingMin: null,
  city: null,
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Populare" },
  { key: "rating", label: "Cele mai bine notate" },
  { key: "price_asc", label: "Preț crescător" },
  { key: "price_desc", label: "Preț descrescător" },
  { key: "newest", label: "Cele mai noi" },
];

const CITY_OPTIONS = [
  "Chișinău",
  "Bălți",
  "Cahul",
  "Orhei",
  "Ungheni",
  "Comrat",
];

function countAdv(a: AdvFilters): number {
  return (
    (a.sort ? 1 : 0) +
    (a.priceMin ? 1 : 0) +
    (a.priceMax ? 1 : 0) +
    (a.ratingMin ? 1 : 0) +
    (a.city ? 1 : 0)
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    category?: string;
    featured?: string;
    q?: string;
  }>();

  const [queryText, setQueryText] = useState(params.q ?? "");
  const [adv, setAdv] = useState<AdvFilters>(EMPTY_ADV);
  const [filterOpen, setFilterOpen] = useState(false);
  const advCount = countAdv(adv);

  const filters = useMemo(
    () => ({
      category: params.category ?? null,
      featured: params.featured === "1",
      q: queryText.trim() || null,
      adv,
    }),
    [params.category, params.featured, queryText, adv],
  );

  const artistsQuery = useInfiniteQuery<ArtistListResponse>({
    queryKey: ["artists", "search", filters],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await publicApi.get<ArtistListResponse>(API_PATHS.artists, {
        query: {
          page: pageParam as number,
          limit: PAGE_SIZE,
          category: filters.category,
          featured: filters.featured ? 1 : undefined,
          q: filters.q,
          sort: adv.sort ?? undefined,
          price_min: adv.priceMin ? Number(adv.priceMin) : undefined,
          price_max: adv.priceMax ? Number(adv.priceMax) : undefined,
          rating_min: adv.ratingMin ?? undefined,
          city: adv.city ?? undefined,
        },
      });
      return (
        res.data ?? { items: [], total: 0, page: 1, totalPages: 1 }
      );
    },
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
  });

  const items = useMemo(
    () => artistsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [artistsQuery.data],
  );

  const handleRefresh = useCallback(() => {
    void artistsQuery.refetch();
  }, [artistsQuery]);

  const renderItem = useCallback(
    ({ item }: { item: ArtistListItem }) => (
      <ArtistRow
        artist={item}
        onPress={() => router.push(`/(client)/artist/${item.slug}`)}
      />
    ),
    [router],
  );

  return (
    <SafeScreen padded={false} scroll={false}>
      {/* Search bar */}
      <View className="border-b border-border bg-background px-5 py-3">
        <View className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-2.5">
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            value={queryText}
            onChangeText={setQueryText}
            placeholder="Caută artiști, categorii…"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.gold}
            className="flex-1 text-[15px] text-foreground"
            returnKeyType="search"
            autoCorrect={false}
          />
          {queryText.length > 0 && (
            <Pressable hitSlop={8} onPress={() => setQueryText("")}>
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingTop: 12 }}
        >
          <FilterChip
            label={advCount > 0 ? `Filtre · ${advCount}` : "Filtre"}
            Icon={SlidersHorizontal}
            active={advCount > 0}
            onPress={() => setFilterOpen(true)}
          />
          {filters.category && (
            <FilterChip
              label={`Categorie: ${filters.category}`}
              active
              onPress={() =>
                router.setParams({ category: undefined })
              }
              dismissable
            />
          )}
          {filters.featured && (
            <FilterChip
              label="Recomandate"
              active
              onPress={() => router.setParams({ featured: undefined })}
              dismissable
            />
          )}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={artistsQuery.isRefetching && !artistsQuery.isFetchingNextPage}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
          />
        }
        onEndReached={() => {
          if (artistsQuery.hasNextPage && !artistsQuery.isFetchingNextPage) {
            void artistsQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          artistsQuery.isLoading ? <ListSkeleton /> : <EmptyState />
        }
        ListFooterComponent={
          artistsQuery.isFetchingNextPage ? (
            <Text className="py-4 text-center text-[13px] text-muted-foreground">
              Se încarcă…
            </Text>
          ) : null
        }
      />

      <FilterSheet
        visible={filterOpen}
        initial={adv}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          setAdv(next);
          setFilterOpen(false);
        }}
      />
    </SafeScreen>
  );
}

// ─── Filter bottom-sheet ───────────────────────────────────

function FilterSheet({
  visible,
  initial,
  onClose,
  onApply,
}: {
  visible: boolean;
  initial: AdvFilters;
  onClose: () => void;
  onApply: (next: AdvFilters) => void;
}) {
  const [draft, setDraft] = useState<AdvFilters>(initial);

  // Re-seed the draft each time the sheet opens so it reflects the
  // currently-applied filters. Intentionally keyed on `visible` only — we
  // don't want parent re-renders to wipe in-progress edits while it's open.
  useEffect(() => {
    if (visible) setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable
          className="rounded-t-3xl border-t border-border bg-background px-5 pb-8 pt-3"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-border" />
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="font-heading text-[18px] font-bold text-foreground">
              Filtre
            </Text>
            <Pressable hitSlop={8} onPress={() => setDraft(EMPTY_ADV)}>
              <Text className="text-[13px] text-gold">Resetează</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="max-h-[460px]">
            {/* Sort */}
            <FilterLabel>Sortează după</FilterLabel>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {SORT_OPTIONS.map((o) => (
                <OptionChip
                  key={o.key}
                  label={o.label}
                  active={draft.sort === o.key}
                  onPress={() =>
                    setDraft((d) => ({
                      ...d,
                      sort: d.sort === o.key ? null : o.key,
                    }))
                  }
                />
              ))}
            </View>

            {/* Price range */}
            <FilterLabel>Preț (€)</FilterLabel>
            <View className="mb-4 flex-row items-center gap-3">
              <View className="flex-1 flex-row items-center rounded-xl bg-card px-3 py-2.5">
                <Text className="mr-1 text-[13px] text-muted-foreground">de la</Text>
                <TextInput
                  value={draft.priceMin}
                  onChangeText={(t) =>
                    setDraft((d) => ({ ...d, priceMin: t.replace(/[^0-9]/g, "") }))
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  className="flex-1 text-[15px] text-foreground"
                />
              </View>
              <View className="flex-1 flex-row items-center rounded-xl bg-card px-3 py-2.5">
                <Text className="mr-1 text-[13px] text-muted-foreground">până la</Text>
                <TextInput
                  value={draft.priceMax}
                  onChangeText={(t) =>
                    setDraft((d) => ({ ...d, priceMax: t.replace(/[^0-9]/g, "") }))
                  }
                  keyboardType="number-pad"
                  placeholder="∞"
                  placeholderTextColor={colors.mutedForeground}
                  className="flex-1 text-[15px] text-foreground"
                />
              </View>
            </View>

            {/* Rating */}
            <FilterLabel>Rating minim</FilterLabel>
            <View className="mb-4 flex-row gap-2">
              {[3, 4, 4.5].map((r) => (
                <OptionChip
                  key={r}
                  label={`${r}★+`}
                  active={draft.ratingMin === r}
                  onPress={() =>
                    setDraft((d) => ({ ...d, ratingMin: d.ratingMin === r ? null : r }))
                  }
                />
              ))}
            </View>

            {/* City */}
            <FilterLabel>Oraș</FilterLabel>
            <View className="mb-2 flex-row flex-wrap gap-2">
              {CITY_OPTIONS.map((c) => (
                <OptionChip
                  key={c}
                  label={c}
                  active={draft.city === c}
                  onPress={() =>
                    setDraft((d) => ({ ...d, city: d.city === c ? null : c }))
                  }
                />
              ))}
            </View>
          </ScrollView>

          <Pressable
            onPress={() => onApply(draft)}
            className="mt-4 items-center rounded-2xl bg-gold py-3.5 active:opacity-80"
          >
            <Text className="text-[15px] font-bold text-background">
              Aplică filtrele
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </Text>
  );
}

function OptionChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 ${
        active ? "border-gold bg-gold/15" : "border-border bg-card"
      }`}
    >
      {active && <Check size={13} color={colors.gold} />}
      <Text
        className={`text-[13px] font-medium ${active ? "text-gold" : "text-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Sub-components ────────────────────────────────────────

function FilterChip({
  label,
  Icon,
  active,
  onPress,
  dismissable,
}: {
  label: string;
  Icon?: typeof SlidersHorizontal;
  active: boolean;
  onPress: () => void;
  dismissable?: boolean;
}) {
  return (
    <Pressable
      hitSlop={4}
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
        active ? "border-gold/40 bg-gold/15" : "border-border bg-card"
      }`}
    >
      {Icon && <Icon size={14} color={active ? colors.gold : colors.mutedForeground} />}
      <Text
        className={`text-[12px] font-medium ${active ? "text-gold" : "text-foreground"}`}
      >
        {label}
      </Text>
      {dismissable && <X size={12} color={colors.gold} />}
    </Pressable>
  );
}

function ArtistRow({
  artist,
  onPress,
}: {
  artist: ArtistListItem;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} className="flex-row gap-3 p-3">
      <View className="h-20 w-20 overflow-hidden rounded-xl">
        <Avatar
          uri={artist.photoUrl}
          name={artist.nameRo}
          sizeClass="h-full w-full"
          ring={artist.isPremium ? "gold" : "none"}
        />
      </View>
      <View className="flex-1 justify-between py-0.5">
        <View>
          <View className="flex-row items-center gap-2">
            <Text
              numberOfLines={1}
              className="flex-1 text-[15px] font-semibold text-foreground"
            >
              {artist.nameRo}
            </Text>
            {artist.isPremium && (
              <Badge tone="gold" size="sm">
                Premium
              </Badge>
            )}
          </View>
          {artist.descriptionRo && (
            <Text
              numberOfLines={2}
              className="mt-0.5 text-[12px] leading-4 text-muted-foreground"
            >
              {artist.descriptionRo}
            </Text>
          )}
        </View>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1">
            {artist.ratingAvg != null && artist.ratingCount > 0 ? (
              <>
                <Star size={12} color={colors.warning} fill={colors.warning} />
                <Text className="text-[12px] text-foreground">
                  {artist.ratingAvg.toFixed(1)}
                </Text>
                <Text className="text-[11px] text-muted-foreground">
                  ({artist.ratingCount})
                </Text>
              </>
            ) : (
              <Text className="text-[11px] text-muted-foreground">
                Fără recenzii
              </Text>
            )}
          </View>
          {artist.priceFrom != null && (
            <Text className="text-[12px] font-semibold text-gold">
              de la {artist.priceFrom} €
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <View className="gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          className="flex-row gap-3 rounded-2xl border border-border bg-card p-3"
        >
          <View className="h-20 w-20 rounded-xl bg-muted" />
          <View className="flex-1 gap-2 py-1">
            <View className="h-4 w-32 rounded bg-muted" />
            <View className="h-3 w-48 rounded bg-muted" />
            <View className="h-3 w-24 rounded bg-muted" />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState() {
  return (
    <View className="items-center gap-3 py-16">
      <Search size={48} color={colors.mutedForeground} />
      <Text className="font-heading text-[18px] font-bold text-foreground">
        Niciun rezultat
      </Text>
      <Text className="max-w-[260px] text-center text-[13px] text-muted-foreground">
        Încearcă alte cuvinte cheie sau elimină câteva filtre.
      </Text>
    </View>
  );
}
