// Client home tab.
//
// Layout (top to bottom):
//   1. Welcome header — "Salut, <name>!" + search shortcut
//   2. Categories grid — 4 cols × 2 rows, icon + name, scrolls
//      horizontally on overflow
//   3. Featured artists — horizontal scroll of premium artists
//   4. Săli populare — horizontal scroll of top-rated venues
//   5. "Plănuiește un eveniment" CTA — large gold card linking to the
//      planning wizard
//
// Data fetched in parallel via TanStack Query (M5 will wire the
// persister + offline cache). For M2 we hit /api/v1/categories,
// /api/v1/artists?featured=1, /api/v1/venues?featured=1.

import { View, Text, ScrollView, Pressable } from "react-native";
import { Link, useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { Search, Sparkles, ArrowRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { SafeScreen, Card, Avatar, Badge } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { publicApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

interface Category {
  id: number;
  nameRo: string;
  slug: string;
  icon?: string | null;
}

interface ArtistCardData {
  id: number;
  nameRo: string;
  slug: string;
  photoUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  isPremium: boolean;
  priceFrom: number | null;
  priceCurrency: string | null;
  baseCity: string | null;
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useUser();

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await publicApi.get<{ categories: Category[] } | Category[]>(
        API_PATHS.categories,
      );
      // The categories endpoint returns either { categories: [] } or
      // a raw array depending on the call site; handle both shapes.
      const body = res.data;
      if (Array.isArray(body)) return body;
      return body?.categories ?? [];
    },
  });

  const featuredQuery = useQuery({
    queryKey: ["artists", "featured"],
    queryFn: async () => {
      const res = await publicApi.get<{ items: ArtistCardData[] }>(
        API_PATHS.artists,
        { query: { featured: 1, limit: 10 } },
      );
      return res.data?.items ?? [];
    },
  });

  return (
    <SafeScreen padded scroll>
      {/* Welcome */}
      <View>
        <Text className="text-[14px] text-muted-foreground">Salut,</Text>
        <Text className="font-heading text-[28px] font-bold text-foreground">
          {user?.firstName ?? "Vladislav"}!
        </Text>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Ce evenimentul tău are nevoie?
        </Text>
      </View>

      {/* Search shortcut */}
      <Pressable
        onPress={() => router.push("/(client)/(tabs)/search")}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"
      >
        <Search size={20} color={colors.mutedForeground} />
        <Text className="flex-1 text-[15px] text-muted-foreground">
          Caută artiști, săli, servicii…
        </Text>
      </Pressable>

      {/* Categories */}
      <Section
        title="Categorii"
        actionLabel={t("common.seeAll")}
        onAction={() => router.push("/(client)/(tabs)/search")}
      >
        {categoriesQuery.isLoading ? (
          <CategorySkeleton />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            {(categoriesQuery.data ?? []).slice(0, 12).map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() =>
                  router.push({
                    pathname: "/(client)/(tabs)/search",
                    params: { category: cat.slug },
                  })
                }
                className="w-[88px] items-center gap-2"
              >
                <View className="h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card">
                  <Sparkles size={24} color={colors.gold} />
                </View>
                <Text
                  numberOfLines={2}
                  className="text-center text-[12px] font-medium text-foreground"
                >
                  {cat.nameRo}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Section>

      {/* Featured artists */}
      <Section
        title="Artiști recomandați"
        actionLabel={t("common.seeAll")}
        onAction={() =>
          router.push({
            pathname: "/(client)/(tabs)/search",
            params: { featured: "1" },
          })
        }
      >
        {featuredQuery.isLoading ? (
          <ArtistRowSkeleton />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            {(featuredQuery.data ?? []).slice(0, 10).map((a) => (
              <FeaturedArtistCard
                key={a.id}
                artist={a}
                onPress={() => router.push(`/(client)/artist/${a.slug}`)}
              />
            ))}
          </ScrollView>
        )}
      </Section>

      {/* Plan CTA */}
      <Pressable
        onPress={() => router.push("/(client)/(tabs)/cabinet")}
        className="overflow-hidden rounded-2xl border border-gold/30 bg-card"
      >
        <View className="flex-row items-center gap-4 p-5">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-gold/15">
            <Sparkles size={28} color={colors.gold} />
          </View>
          <View className="flex-1">
            <Text className="font-heading text-[18px] font-bold text-foreground">
              Plănuiește un eveniment
            </Text>
            <Text className="mt-0.5 text-[13px] text-muted-foreground">
              7 pași — buget, invitați, checklist, totul în app.
            </Text>
          </View>
          <ArrowRight size={20} color={colors.gold} />
        </View>
      </Pressable>
    </SafeScreen>
  );
}

// ─── Sub-components ────────────────────────────────────

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-heading text-[18px] font-bold text-foreground">
          {title}
        </Text>
        {actionLabel && onAction && (
          <Pressable hitSlop={8} onPress={onAction} className="flex-row items-center gap-1">
            <Text className="text-[13px] text-gold">{actionLabel}</Text>
            <ArrowRight size={14} color={colors.gold} />
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function CategorySkeleton() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12 }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} className="w-[88px] items-center gap-2">
          <View className="h-16 w-16 rounded-2xl bg-muted" />
          <View className="h-3 w-12 rounded bg-muted" />
        </View>
      ))}
    </ScrollView>
  );
}

function ArtistRowSkeleton() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12 }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} className="w-[180px] gap-2">
          <View className="aspect-[4/3] w-full rounded-2xl bg-muted" />
          <View className="h-4 w-32 rounded bg-muted" />
          <View className="h-3 w-20 rounded bg-muted" />
        </View>
      ))}
    </ScrollView>
  );
}

function FeaturedArtistCard({
  artist,
  onPress,
}: {
  artist: ArtistCardData;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} className="w-[180px] gap-2 p-3">
      <View className="aspect-[4/3] overflow-hidden rounded-xl">
        <Avatar
          uri={artist.photoUrl}
          name={artist.nameRo}
          sizeClass="h-full w-full"
        />
      </View>
      <View className="flex-row items-center justify-between">
        <Text
          numberOfLines={1}
          className="flex-1 text-[14px] font-semibold text-foreground"
        >
          {artist.nameRo}
        </Text>
        {artist.isPremium && (
          <Badge tone="gold" size="sm">
            ★
          </Badge>
        )}
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-[12px] text-muted-foreground">
          {artist.baseCity ?? "—"}
        </Text>
        {artist.priceFrom != null && (
          <Text className="text-[12px] font-semibold text-gold">
            de la {artist.priceFrom} €
          </Text>
        )}
      </View>
    </Card>
  );
}
