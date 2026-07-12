// Venue detail. Same skeleton as artist detail but with venue-specific
// fields: capacity range, price per person, working hours, virtual
// tour link, facilities list.

import { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import {
  ArrowLeft,
  Heart,
  Share2,
  Star,
  MapPin,
  Users,
  Eye,
  Send,
  CheckCircle2,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Badge } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { publicApi } from "../../../lib/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GALLERY_HEIGHT = 360;

interface VenueDetail {
  id: number;
  nameRo: string;
  slug: string;
  descriptionRo: string | null;
  photoUrl: string | null;
  coverImageUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  isVerified: boolean;
  isPremium: boolean;
  capacityMin: number | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  location: string | null;
  virtualTourUrl: string | null;
  facilities: string[] | null;
  images?: { id: number; url: string }[];
}

export default function VenueDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [galleryIndex, setGalleryIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const { data: venue, isLoading } = useQuery({
    queryKey: ["venue", slug],
    queryFn: async () => {
      const res = await publicApi.get<VenueDetail>(`/venues/${slug}`);
      return res.data;
    },
    enabled: !!slug,
  });

  if (isLoading || !venue) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-background"
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}
      >
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const gallery = venue.images?.map((img) => img.url) ??
    [venue.coverImageUrl ?? venue.photoUrl ?? "/images/backgrounds/party-dance.jpg"];

  return (
    <View className="flex-1 bg-background" style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView
        edges={["top"]}
        className="absolute inset-x-0 top-0 z-10"
        style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 10 }}
        pointerEvents="box-none"
      >
        <View
          className="flex-row items-center justify-between px-4 py-2"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur"
            style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "rgba(0,0,0,0.4)" }}
          >
            <ArrowLeft size={20} color="#fff" />
          </Pressable>
          <View className="flex-row gap-2" style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur"
              style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "rgba(0,0,0,0.4)" }}
            >
              <Heart size={20} color="#fff" />
            </Pressable>
            <Pressable
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur"
              style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "rgba(0,0,0,0.4)" }}
            >
              <Share2 size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView ref={scrollRef} className="flex-1" style={{ flex: 1 }}>
        <View style={{ height: GALLERY_HEIGHT }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              setGalleryIndex(
                Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH),
              );
            }}
          >
            {gallery.map((src, i) => (
              <Image
                key={i}
                source={{ uri: src }}
                style={{ width: SCREEN_WIDTH, height: GALLERY_HEIGHT }}
                contentFit="cover"
                transition={200}
              />
            ))}
          </ScrollView>
          {gallery.length > 1 && (
            <View
              className="absolute inset-x-0 bottom-3 flex-row justify-center gap-1.5"
              style={{ position: "absolute", left: 0, right: 0, bottom: 12, flexDirection: "row", justifyContent: "center", gap: 6 }}
            >
              {gallery.map((_, i) => (
                <View
                  key={i}
                  className={`h-1.5 rounded-full ${
                    i === galleryIndex ? "w-6 bg-gold" : "w-1.5 bg-white/40"
                  }`}
                  style={[
                    { height: 6, borderRadius: 9999 },
                    i === galleryIndex
                      ? { width: 24, backgroundColor: colors.gold }
                      : { width: 6, backgroundColor: "rgba(255,255,255,0.4)" },
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        <View className="gap-5 px-5 pb-32 pt-5" style={{ gap: 20, paddingHorizontal: 20, paddingBottom: 128, paddingTop: 20 }}>
          <View className="gap-2" style={{ gap: 8 }}>
            <View className="flex-row items-center gap-2" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {venue.isPremium && <Badge tone="gold">Premium</Badge>}
              {venue.isVerified && (
                <Badge tone="info">
                  <View className="flex-row items-center gap-1" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={10} color={colors.info} />
                    <Text
                      className="text-[11px] font-semibold text-info"
                      style={{ fontSize: 11, fontWeight: "600", color: colors.info }}
                    >
                      Verificat
                    </Text>
                  </View>
                </Badge>
              )}
            </View>
            <Text
              className="font-heading text-[28px] font-bold leading-tight text-foreground"
              style={{ fontSize: 28, fontWeight: "700", lineHeight: 32, color: colors.foreground }}
            >
              {venue.nameRo}
            </Text>
            <View className="flex-row items-center gap-4" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              {venue.ratingAvg != null && venue.ratingCount > 0 && (
                <View className="flex-row items-center gap-1" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Star size={14} color={colors.warning} fill={colors.warning} />
                  <Text
                    className="text-[13px] font-semibold text-foreground"
                    style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}
                  >
                    {venue.ratingAvg.toFixed(1)}
                  </Text>
                  <Text
                    className="text-[12px] text-muted-foreground"
                    style={{ fontSize: 12, color: colors.mutedForeground }}
                  >
                    ({venue.ratingCount})
                  </Text>
                </View>
              )}
              {venue.location && (
                <View className="flex-row items-center gap-1" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MapPin size={14} color={colors.mutedForeground} />
                  <Text
                    className="text-[13px] text-muted-foreground"
                    style={{ fontSize: 13, color: colors.mutedForeground }}
                  >
                    {venue.location}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Quick stats */}
          <View className="flex-row gap-3" style={{ flexDirection: "row", gap: 12 }}>
            <View
              className="flex-1 items-center rounded-2xl border border-border bg-card p-3"
              style={{ flex: 1, alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 }}
            >
              <Users size={20} color={colors.gold} />
              <Text
                className="mt-1 text-[11px] text-muted-foreground"
                style={{ marginTop: 4, fontSize: 11, color: colors.mutedForeground }}
              >
                Capacitate
              </Text>
              <Text
                className="text-[14px] font-semibold text-foreground"
                style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
              >
                {venue.capacityMin ?? "—"}–{venue.capacityMax ?? "—"}
              </Text>
            </View>
            {venue.pricePerPerson != null && (
              <View
                className="flex-1 items-center rounded-2xl border border-border bg-card p-3"
                style={{ flex: 1, alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 }}
              >
                <Text
                  className="text-[20px] font-bold text-gold"
                  style={{ fontSize: 20, fontWeight: "700", color: colors.gold }}
                >
                  €
                </Text>
                <Text
                  className="mt-1 text-[11px] text-muted-foreground"
                  style={{ marginTop: 4, fontSize: 11, color: colors.mutedForeground }}
                >
                  Persoană
                </Text>
                <Text
                  className="text-[14px] font-semibold text-foreground"
                  style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
                >
                  {venue.pricePerPerson} €
                </Text>
              </View>
            )}
            {venue.virtualTourUrl && (
              <Pressable
                onPress={() => Linking.openURL(venue.virtualTourUrl!)}
                className="flex-1 items-center rounded-2xl border border-gold/40 bg-gold/10 p-3"
                style={{ flex: 1, alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: "rgba(201,168,76,0.4)", backgroundColor: "rgba(201,168,76,0.1)", padding: 12 }}
              >
                <Eye size={20} color={colors.gold} />
                <Text
                  className="mt-1 text-[11px] text-gold"
                  style={{ marginTop: 4, fontSize: 11, color: colors.gold }}
                >
                  Tur virtual
                </Text>
                <Text
                  className="text-[14px] font-semibold text-gold"
                  style={{ fontSize: 14, fontWeight: "600", color: colors.gold }}
                >
                  360°
                </Text>
              </Pressable>
            )}
          </View>

          {venue.descriptionRo && (
            <View>
              <Text
                className="mb-2 font-heading text-[16px] font-bold text-foreground"
                style={{ marginBottom: 8, fontSize: 16, fontWeight: "700", color: colors.foreground }}
              >
                Despre
              </Text>
              <Text
                className="text-[14px] leading-5 text-foreground/85"
                style={{ fontSize: 14, lineHeight: 20, color: "rgba(247,245,238,0.85)" }}
              >
                {venue.descriptionRo}
              </Text>
            </View>
          )}

          {venue.facilities && venue.facilities.length > 0 && (
            <View>
              <Text
                className="mb-2 font-heading text-[16px] font-bold text-foreground"
                style={{ marginBottom: 8, fontSize: 16, fontWeight: "700", color: colors.foreground }}
              >
                Facilități
              </Text>
              <View className="flex-row flex-wrap gap-2" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {venue.facilities.map((f) => (
                  <Badge key={f} tone="default" size="md">
                    {f}
                  </Badge>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <SafeAreaView
        edges={["bottom"]}
        className="absolute inset-x-0 bottom-0"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
      >
        <View
          className="border-t border-border bg-background/95 px-5 py-3 backdrop-blur"
          style={{ borderTopWidth: 1, borderColor: colors.border, backgroundColor: "rgba(13,13,13,0.95)", paddingHorizontal: 20, paddingVertical: 12 }}
        >
          <View className="flex-row items-center gap-3" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {venue.pricePerPerson != null && (
              <View>
                <Text
                  className="text-[11px] text-muted-foreground"
                  style={{ fontSize: 11, color: colors.mutedForeground }}
                >
                  de la
                </Text>
                <Text
                  className="font-heading text-[20px] font-bold text-gold"
                  style={{ fontSize: 20, fontWeight: "700", color: colors.gold }}
                >
                  {venue.pricePerPerson} €/p
                </Text>
              </View>
            )}
            <View className="flex-1" style={{ flex: 1 }}>
              <Button
                onPress={() =>
                  router.push({
                    pathname: "/(client)/booking-new",
                    params: { venueId: venue.id },
                  })
                }
                fullWidth
                size="lg"
                leftIcon={<Send size={18} color={colors.background} />}
              >
                Verifică disponibilitate
              </Button>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
