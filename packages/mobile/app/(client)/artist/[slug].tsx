// Artist detail.
//
// Layout:
//   1. Sticky photo carousel (height ~360px, parallax on scroll)
//   2. Header with name, rating, premium badge, base city
//   3. Description block
//   4. Pricing packages list (if any) — each opens a "Trimite cerere"
//      sheet pre-filled with the package details
//   5. Reviews snippet (top 2) — tap "Vezi toate" to see all
//   6. Sticky bottom CTA "Trimite cerere" (gold)
//
// We use expo-image's transition prop to crossfade between gallery
// photos for a smoother feel than the default React Native Image.

import { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
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
  CheckCircle2,
  Send,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Badge, Card } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { publicApi } from "../../../lib/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GALLERY_HEIGHT = 380;

interface ArtistDetail {
  id: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  slug: string;
  descriptionRo: string | null;
  photoUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  isPremium: boolean;
  isVerified: boolean;
  priceFrom: number | null;
  priceCurrency: string | null;
  priceHidden: boolean;
  baseCity: string | null;
  travelDistanceKm: number | null;
  categoryNames?: string[];
  images?: { id: number; url: string; isCover?: boolean }[];
  packages?: {
    id: number;
    title: string;
    description: string | null;
    price: number;
    durationHours: number | null;
  }[];
  reviews?: {
    id: number;
    authorName: string;
    rating: number;
    comment: string | null;
    createdAt: string;
  }[];
}

export default function ArtistDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [galleryIndex, setGalleryIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const { data: artist, isLoading } = useQuery({
    queryKey: ["artist", slug],
    queryFn: async () => {
      const res = await publicApi.get<ArtistDetail>(`/artists/${slug}`);
      return res.data;
    },
    enabled: !!slug,
  });

  if (isLoading || !artist) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const gallery =
    artist.images && artist.images.length > 0
      ? artist.images.map((img) => img.url)
      : artist.photoUrl
        ? [artist.photoUrl]
        : ["/images/backgrounds/party-dance.jpg"];

  return (
    <View className="flex-1 bg-background">
      {/* Floating back / share buttons over the gallery */}
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
        {/* Gallery */}
        <View style={{ height: GALLERY_HEIGHT }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const i = Math.round(
                e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
              );
              setGalleryIndex(i);
            }}
          >
            {gallery.map((src, i) => (
              <Image
                key={i}
                source={{ uri: src }}
                style={{ width: SCREEN_WIDTH, height: GALLERY_HEIGHT }}
                contentFit="cover"
                transition={200}
                recyclingKey={src}
              />
            ))}
          </ScrollView>
          {/* Pagination dots */}
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

        {/* Body */}
        <View className="gap-5 px-5 pb-32 pt-5">
          {/* Title row */}
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              {artist.isPremium && <Badge tone="gold">Premium</Badge>}
              {artist.isVerified && (
                <Badge tone="info">
                  <View className="flex-row items-center gap-1">
                    <CheckCircle2 size={10} color={colors.info} />
                    <Text className="text-[11px] font-semibold text-info">
                      Verificat
                    </Text>
                  </View>
                </Badge>
              )}
              {artist.categoryNames?.[0] && (
                <Badge tone="default">{artist.categoryNames[0]}</Badge>
              )}
            </View>
            <Text className="font-heading text-[28px] font-bold leading-tight text-foreground">
              {artist.nameRo}
            </Text>
            <View className="flex-row items-center gap-4">
              {artist.ratingAvg != null && artist.ratingCount > 0 && (
                <View className="flex-row items-center gap-1">
                  <Star size={14} color={colors.warning} fill={colors.warning} />
                  <Text className="text-[13px] font-semibold text-foreground">
                    {artist.ratingAvg.toFixed(1)}
                  </Text>
                  <Text className="text-[12px] text-muted-foreground">
                    ({artist.ratingCount} recenzii)
                  </Text>
                </View>
              )}
              {artist.baseCity && (
                <View className="flex-row items-center gap-1">
                  <MapPin size={14} color={colors.mutedForeground} />
                  <Text className="text-[13px] text-muted-foreground">
                    {artist.baseCity}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Description */}
          {artist.descriptionRo && (
            <View>
              <Text className="mb-2 font-heading text-[16px] font-bold text-foreground">
                Despre
              </Text>
              <Text className="text-[14px] leading-5 text-foreground/85">
                {artist.descriptionRo}
              </Text>
            </View>
          )}

          {/* Packages */}
          {artist.packages && artist.packages.length > 0 && (
            <View>
              <Text className="mb-2 font-heading text-[16px] font-bold text-foreground">
                Pachete & Tarife
              </Text>
              <View className="gap-2">
                {artist.packages.map((pkg) => (
                  <Card key={pkg.id} className="gap-1">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text className="text-[15px] font-semibold text-foreground">
                          {pkg.title}
                        </Text>
                        {pkg.description && (
                          <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                            {pkg.description}
                          </Text>
                        )}
                        {pkg.durationHours && (
                          <Text className="mt-1 text-[12px] text-muted-foreground">
                            {pkg.durationHours}h
                          </Text>
                        )}
                      </View>
                      <Text className="text-[16px] font-bold text-gold">
                        {pkg.price} €
                      </Text>
                    </View>
                  </Card>
                ))}
              </View>
            </View>
          )}

          {/* Reviews */}
          {artist.reviews && artist.reviews.length > 0 && (
            <View>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="font-heading text-[16px] font-bold text-foreground">
                  Recenzii ({artist.ratingCount})
                </Text>
                <Pressable hitSlop={8}>
                  <Text className="text-[13px] text-gold">Vezi toate</Text>
                </Pressable>
              </View>
              <View className="gap-2">
                {artist.reviews.slice(0, 2).map((r) => (
                  <Card key={r.id}>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-[13px] font-semibold text-foreground">
                        {r.authorName}
                      </Text>
                      <View className="flex-row gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={12}
                            color={
                              i < r.rating ? colors.warning : colors.muted
                            }
                            fill={i < r.rating ? colors.warning : "transparent"}
                          />
                        ))}
                      </View>
                    </View>
                    {r.comment && (
                      <Text className="mt-1 text-[13px] leading-5 text-foreground/85">
                        {r.comment}
                      </Text>
                    )}
                  </Card>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <SafeAreaView edges={["bottom"]} className="absolute inset-x-0 bottom-0">
        <View className="border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
          <View className="flex-row items-center gap-3">
            {!artist.priceHidden && artist.priceFrom != null && (
              <View>
                <Text className="text-[11px] text-muted-foreground">
                  de la
                </Text>
                <Text className="font-heading text-[20px] font-bold text-gold">
                  {artist.priceFrom} €
                </Text>
              </View>
            )}
            <View className="flex-1">
              <Button
                onPress={() => {
                  // Booking modal — built out in M3.
                  router.push({
                    pathname: "/(client)/booking-new",
                    params: { artistId: artist.id },
                  });
                }}
                fullWidth
                size="lg"
                leftIcon={<Send size={18} color={colors.background} />}
              >
                Trimite cerere
              </Button>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
