// Venue detail. Same skeleton as artist detail but with venue-specific
// fields: capacity range, price per person, working hours, virtual
// tour link, facilities list.

import { useState, useRef } from "react";
import { mediaUrl } from "../../../lib/links";
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
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Badge, ErrorState } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { publicApi, unwrap } from "../../../lib/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GALLERY_HEIGHT = 360;

interface VenueDetail {
  id: number;
  nameRo: string;
  slug: string;
  descriptionRo: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  isFeatured: boolean;
  capacityMin: number | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  city: string | null;
  virtualTourUrl: string | null;
  facilities: string[] | null;
  images?: { id: number; url: string }[];
}

export default function VenueDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [galleryIndex, setGalleryIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const {
    data: venue,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["venue", slug],
    queryFn: async () => {
      const res = await publicApi.get<VenueDetail>(`/venues/${slug}`);
      return unwrap(res);
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  // Failure has its own branch now. Before, a 404 or a dead network
  // resolved the query with data:null, so this guard stayed true and the
  // screen span forever with no way to tell what had gone wrong.
  if (isError || !venue) {
    return (
      <ErrorState error={error} onRetry={() => refetch()} retrying={isFetching} />
    );
  }

  const gallery = venue.images && venue.images.length > 0
    ? venue.images.map((img) => img.url)
    : ["/images/backgrounds/party-dance.jpg"];

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView
        edges={["top"]}
        className="absolute inset-x-0 top-0 z-10"
        pointerEvents="box-none"
      >
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur"
          >
            <ArrowLeft size={20} color="#fff" />
          </Pressable>
          <View className="flex-row gap-2">
            <Pressable
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur"
            >
              <Heart size={20} color="#fff" />
            </Pressable>
            <Pressable
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur"
            >
              <Share2 size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView ref={scrollRef} className="flex-1">
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
                source={{ uri: mediaUrl(src)! }}
                style={{ width: SCREEN_WIDTH, height: GALLERY_HEIGHT }}
                contentFit="cover"
                transition={200}
              />
            ))}
          </ScrollView>
          {gallery.length > 1 && (
            <View className="absolute inset-x-0 bottom-3 flex-row justify-center gap-1.5">
              {gallery.map((_, i) => (
                <View
                  key={i}
                  className={`h-1.5 rounded-full ${
                    i === galleryIndex ? "w-6 bg-gold" : "w-1.5 bg-white/40"
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        <View className="gap-5 px-5 pb-32 pt-5">
          <View className="gap-2">
            {venue.isFeatured && (
              <View className="flex-row items-center gap-2">
                <Badge tone="gold">Premium</Badge>
              </View>
            )}
            <Text className="font-heading text-[28px] font-bold leading-tight text-foreground">
              {venue.nameRo}
            </Text>
            <View className="flex-row items-center gap-4">
              {venue.ratingAvg != null && venue.ratingCount > 0 && (
                <View className="flex-row items-center gap-1">
                  <Star size={14} color={colors.warning} fill={colors.warning} />
                  <Text className="text-[13px] font-semibold text-foreground">
                    {venue.ratingAvg.toFixed(1)}
                  </Text>
                  <Text className="text-[12px] text-muted-foreground">
                    ({venue.ratingCount})
                  </Text>
                </View>
              )}
              {venue.city && (
                <View className="flex-row items-center gap-1">
                  <MapPin size={14} color={colors.mutedForeground} />
                  <Text className="text-[13px] text-muted-foreground">
                    {venue.city}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Quick stats */}
          <View className="flex-row gap-3">
            <View className="flex-1 items-center rounded-2xl border border-border bg-card p-3">
              <Users size={20} color={colors.gold} />
              <Text className="mt-1 text-[11px] text-muted-foreground">
                Capacitate
              </Text>
              <Text className="text-[14px] font-semibold text-foreground">
                {venue.capacityMin ?? "—"}–{venue.capacityMax ?? "—"}
              </Text>
            </View>
            {venue.pricePerPerson != null && (
              <View className="flex-1 items-center rounded-2xl border border-border bg-card p-3">
                <Text className="text-[20px] font-bold text-gold">€</Text>
                <Text className="mt-1 text-[11px] text-muted-foreground">
                  Persoană
                </Text>
                <Text className="text-[14px] font-semibold text-foreground">
                  {venue.pricePerPerson} €
                </Text>
              </View>
            )}
            {venue.virtualTourUrl && (
              <Pressable
                onPress={() => Linking.openURL(venue.virtualTourUrl!)}
                className="flex-1 items-center rounded-2xl border border-gold/40 bg-gold/10 p-3"
              >
                <Eye size={20} color={colors.gold} />
                <Text className="mt-1 text-[11px] text-gold">Tur virtual</Text>
                <Text className="text-[14px] font-semibold text-gold">360°</Text>
              </Pressable>
            )}
          </View>

          {venue.descriptionRo && (
            <View>
              <Text className="mb-2 font-heading text-[16px] font-bold text-foreground">
                Despre
              </Text>
              <Text className="text-[14px] leading-5 text-foreground/85">
                {venue.descriptionRo}
              </Text>
            </View>
          )}

          {venue.facilities && venue.facilities.length > 0 && (
            <View>
              <Text className="mb-2 font-heading text-[16px] font-bold text-foreground">
                Facilități
              </Text>
              <View className="flex-row flex-wrap gap-2">
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

      <SafeAreaView edges={["bottom"]} className="absolute inset-x-0 bottom-0">
        <View className="border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
          <View className="flex-row items-center gap-3">
            {venue.pricePerPerson != null && (
              <View>
                <Text className="text-[11px] text-muted-foreground">
                  de la
                </Text>
                <Text className="font-heading text-[20px] font-bold text-gold">
                  {venue.pricePerPerson} €/p
                </Text>
              </View>
            )}
            <View className="flex-1">
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
