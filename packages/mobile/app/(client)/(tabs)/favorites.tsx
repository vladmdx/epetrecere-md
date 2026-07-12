// Favorites tab — saved artists + venues.
//
// Reads from /api/v1/wishlist (auth required). Renders the same row
// layout as the search list so users feel familiar. Tapping a row
// opens the artist/venue detail screen.

import { useCallback } from "react";
import { View, Text, FlatList, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { Heart, X } from "lucide-react-native";
import { SafeScreen, Card, Avatar, Badge } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

interface WishlistItem {
  entityType: "artist" | "venue";
  entityId: number;
  name: string;
  slug: string;
  photoUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  isPremium: boolean;
  city: string | null;
  priceFrom: number | null;
}

export default function FavoritesScreen() {
  const router = useRouter();
  const api = useApi();
  const { isSignedIn } = useAuth();

  const wishlistQuery = useQuery({
    queryKey: ["wishlist"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const res = await api.get<{ items: WishlistItem[] }>(API_PATHS.wishlist);
      return res.data?.items ?? [];
    },
  });

  const handleRefresh = useCallback(() => {
    void wishlistQuery.refetch();
  }, [wishlistQuery]);

  if (!isSignedIn) {
    return (
      <SafeScreen padded scroll={false}>
        <View
          className="flex-1 items-center justify-center gap-3 py-16"
          style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 64 }}
        >
          <Heart size={48} color={colors.mutedForeground} />
          <Text
            className="font-heading text-[18px] font-bold text-foreground"
            style={{ fontFamily: "Cormorant", fontSize: 18, fontWeight: "700", color: colors.foreground }}
          >
            Conectează-te pentru favorite
          </Text>
          <Text
            className="max-w-[260px] text-center text-[13px] text-muted-foreground"
            style={{ maxWidth: 260, textAlign: "center", fontSize: 13, color: colors.mutedForeground }}
          >
            Salvează artiști și săli ca să le revezi rapid.
          </Text>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen padded={false} scroll={false}>
      <View className="px-5 py-3" style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Text
          className="font-heading text-[28px] font-bold text-foreground"
          style={{ fontFamily: "Cormorant", fontSize: 28, fontWeight: "700", color: colors.foreground }}
        >
          Favorite
        </Text>
        <Text
          className="mt-1 text-[13px] text-muted-foreground"
          style={{ marginTop: 4, fontSize: 13, color: colors.mutedForeground }}
        >
          {wishlistQuery.data?.length ?? 0} salvate
        </Text>
      </View>

      <FlatList
        data={wishlistQuery.data ?? []}
        keyExtractor={(it) => `${it.entityType}-${it.entityId}`}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 32,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl
            refreshing={wishlistQuery.isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
          />
        }
        renderItem={({ item }) => (
          <FavoriteRow
            item={item}
            onPress={() =>
              router.push(
                item.entityType === "artist"
                  ? `/(client)/artist/${item.slug}`
                  : `/(client)/venue/${item.slug}`,
              )
            }
          />
        )}
        ListEmptyComponent={
          wishlistQuery.isLoading ? null : (
            <View
              className="items-center gap-3 py-16"
              style={{ alignItems: "center", gap: 12, paddingVertical: 64 }}
            >
              <Heart size={48} color={colors.mutedForeground} />
              <Text
                className="font-heading text-[18px] font-bold text-foreground"
                style={{ fontFamily: "Cormorant", fontSize: 18, fontWeight: "700", color: colors.foreground }}
              >
                Nicio favorită încă
              </Text>
              <Text
                className="max-w-[260px] text-center text-[13px] text-muted-foreground"
                style={{ maxWidth: 260, textAlign: "center", fontSize: 13, color: colors.mutedForeground }}
              >
                Apasă inima pe profilul artiștilor sau sălilor pentru a le salva.
              </Text>
            </View>
          )
        }
      />
    </SafeScreen>
  );
}

function FavoriteRow({
  item,
  onPress,
}: {
  item: WishlistItem;
  onPress: () => void;
}) {
  return (
    <Card
      onPress={onPress}
      className="flex-row gap-3 p-3"
      style={{ flexDirection: "row", gap: 12, padding: 12 }}
    >
      <View
        className="h-20 w-20 overflow-hidden rounded-xl"
        style={{ width: 80, height: 80, overflow: "hidden", borderRadius: 16 }}
      >
        <Avatar
          uri={item.photoUrl}
          name={item.name}
          sizeClass="h-full w-full"
        />
      </View>
      <View className="flex-1 justify-between py-1" style={{ flex: 1, justifyContent: "space-between", paddingVertical: 4 }}>
        <View>
          <View className="flex-row items-center gap-2" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              numberOfLines={1}
              className="flex-1 text-[15px] font-semibold text-foreground"
              style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.foreground }}
            >
              {item.name}
            </Text>
            <Pressable hitSlop={8}>
              <X size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text
            className="mt-0.5 text-[12px] text-muted-foreground"
            style={{ marginTop: 2, fontSize: 12, color: colors.mutedForeground }}
          >
            {item.entityType === "artist" ? "Artist" : "Sală"}
            {item.city ? ` · ${item.city}` : ""}
          </Text>
        </View>
        <View className="flex-row items-center justify-between" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {item.isPremium && <Badge tone="gold" size="sm">Premium</Badge>}
          {item.priceFrom != null && (
            <Text
              className="ml-auto text-[12px] font-semibold text-gold"
              style={{ marginLeft: "auto", fontSize: 12, fontWeight: "600", color: colors.gold }}
            >
              de la {item.priceFrom} €
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}
