// Recenzii — partner's reviews list with star aggregate at the top.

import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Star, MessageSquare } from "lucide-react-native";
import { Card } from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import { relativeTimeRO } from "@epetrecere/shared/utils";

interface Review {
  id: number;
  authorName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export default function RecenziiScreen() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const api = useApi();

  const artistQuery = useQuery({
    queryKey: ["my-artist-id"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const res = await api.get<{ artist: { id: number; ratingAvg: number | null; ratingCount: number } | null }>(
        API_PATHS.myArtist,
      );
      return res.data?.artist ?? null;
    },
    staleTime: Infinity,
  });

  const reviewsQuery = useQuery({
    queryKey: ["my-reviews", artistQuery.data?.id],
    enabled: !!artistQuery.data?.id,
    queryFn: async () => {
      const res = await api.get<{ reviews: Review[] }>(
        `/reviews?artist_id=${artistQuery.data!.id}`,
      );
      return res.data?.reviews ?? [];
    },
  });

  const artist = artistQuery.data;
  const ratingAvg = artist?.ratingAvg ?? null;
  const ratingCount = artist?.ratingCount ?? 0;

  return (
    <View className="flex-1 bg-background" style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]}>
        <View
          className="flex-row items-center gap-2 border-b border-border px-3 py-2"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderBottomWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
            }}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text
            className="font-heading text-[18px] font-bold text-foreground"
            style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}
          >
            Recenzii
          </Text>
        </View>
      </SafeAreaView>

      {/* Aggregate header */}
      <View
        className="border-b border-border px-5 py-4"
        style={{
          borderBottomWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 20,
          paddingVertical: 16,
        }}
      >
        <View
          className="flex-row items-center gap-4"
          style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
        >
          <View className="items-center" style={{ alignItems: "center" }}>
            <Text
              className="font-heading text-[40px] font-bold text-foreground"
              style={{ fontSize: 40, fontWeight: "700", color: colors.foreground }}
            >
              {ratingAvg != null ? ratingAvg.toFixed(1) : "—"}
            </Text>
            <View className="flex-row gap-0.5" style={{ flexDirection: "row", gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={14}
                  color={
                    i < Math.round(ratingAvg ?? 0)
                      ? colors.warning
                      : colors.muted
                  }
                  fill={i < Math.round(ratingAvg ?? 0) ? colors.warning : "transparent"}
                />
              ))}
            </View>
            <Text
              className="mt-1 text-[12px] text-muted-foreground"
              style={{ marginTop: 4, fontSize: 12, color: colors.mutedForeground }}
            >
              {ratingCount} recenzii
            </Text>
          </View>
          <View className="flex-1 gap-1.5" style={{ flex: 1, gap: 6 }}>
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = (reviewsQuery.data ?? []).filter(
                (r) => r.rating === stars,
              ).length;
              const pct = ratingCount > 0 ? (count / ratingCount) * 100 : 0;
              return (
                <View
                  key={stars}
                  className="flex-row items-center gap-2"
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text
                    className="w-3 text-[11px] text-muted-foreground"
                    style={{ width: 12, fontSize: 11, color: colors.mutedForeground }}
                  >
                    {stars}
                  </Text>
                  <Star size={10} color={colors.warning} fill={colors.warning} />
                  <View
                    className="flex-1 h-1.5 overflow-hidden rounded-full bg-muted"
                    style={{
                      flex: 1,
                      height: 6,
                      overflow: "hidden",
                      borderRadius: 9999,
                      backgroundColor: colors.muted,
                    }}
                  >
                    <View
                      style={[
                        { height: "100%" },
                        { width: `${pct}%`, backgroundColor: colors.gold },
                      ]}
                      className="h-full"
                    />
                  </View>
                  <Text
                    className="w-6 text-right text-[11px] text-muted-foreground"
                    style={{
                      width: 24,
                      textAlign: "right",
                      fontSize: 11,
                      color: colors.mutedForeground,
                    }}
                  >
                    {count}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <FlatList
        data={reviewsQuery.data ?? []}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 32,
          gap: 8,
        }}
        renderItem={({ item }) => (
          <Card className="gap-2" style={{ gap: 8 }}>
            <View
              className="flex-row items-center justify-between"
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <Text
                className="text-[14px] font-semibold text-foreground"
                style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
              >
                {item.authorName}
              </Text>
              <Text
                className="text-[11px] text-muted-foreground"
                style={{ fontSize: 11, color: colors.mutedForeground }}
              >
                {relativeTimeRO(item.createdAt)}
              </Text>
            </View>
            <View className="flex-row gap-0.5" style={{ flexDirection: "row", gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={12}
                  color={i < item.rating ? colors.warning : colors.muted}
                  fill={i < item.rating ? colors.warning : "transparent"}
                />
              ))}
            </View>
            {item.comment && (
              <Text
                className="text-[13px] leading-5 text-foreground/85"
                style={{ fontSize: 13, lineHeight: 20, color: "rgba(247,245,238,0.85)" }}
              >
                {item.comment}
              </Text>
            )}
          </Card>
        )}
        ListEmptyComponent={
          reviewsQuery.isLoading ? (
            <View className="items-center py-12" style={{ alignItems: "center", paddingVertical: 48 }}>
              <ActivityIndicator color={colors.gold} />
            </View>
          ) : (
            <View
              className="items-center gap-3 py-12"
              style={{ alignItems: "center", gap: 12, paddingVertical: 48 }}
            >
              <MessageSquare size={48} color={colors.mutedForeground} />
              <Text
                className="font-heading text-[16px] font-bold text-foreground"
                style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}
              >
                Nicio recenzie încă
              </Text>
              <Text
                className="max-w-[260px] text-center text-[13px] text-muted-foreground"
                style={{
                  maxWidth: 260,
                  textAlign: "center",
                  fontSize: 13,
                  color: colors.mutedForeground,
                }}
              >
                După fiecare eveniment finalizat poți cere clientului o recenzie.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
