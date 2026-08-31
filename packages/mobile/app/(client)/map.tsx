// Map view of artists + venues.
//
// No `provider` prop, which means each platform uses its own map: Apple Maps
// on iOS, Google on Android (where Google is the only option and the prop is
// a no-op anyway).
//
// It used to pin PROVIDER_GOOGLE on both. The note that stood here said iOS
// would "fall back to Apple Maps" without a key — it does not; it renders
// nothing. And `userInterfaceStyle="dark"` below is documented Apple-Maps-only,
// so the one thing that made the map match the app's dark UI was being
// silently ignored on the only platform that could honour it.
//
// Nothing here needs Google specifically: `customMapStyle` is unused, and
// pin colours, titles and the user-location dot are supported by both. So iOS
// gets a working dark map with no key and no billing, and Android keeps the
// key it already has in every EAS environment.
//
// Markers are tinted gold for premium / muted for standard. Tap a
// marker → bottom sheet (BottomSheet from @gorhom — we'll add it in
// a later milestone) → quick preview + "Vezi profil" CTA.

import { useState, useMemo } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../constants/theme";
import { publicApi } from "../../lib/api";

interface MapPoint {
  id: number;
  type: "artist" | "venue";
  name: string;
  slug: string;
  isPremium: boolean;
  lat: number | null;
  lng: number | null;
  city: string | null;
}

// Raw venue row as returned by GET /venues (items[]). The list endpoint
// projects the DB columns verbatim, so the name field is `nameRo` (not
// `name`) and the premium flag is `isFeatured` (venues have no `isPremium`).
interface VenueListItem {
  id: number;
  nameRo: string;
  slug: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  isFeatured: boolean | null;
}

// Centered on Chișinău by default — most users are from Moldova.
const DEFAULT_REGION: Region = {
  latitude: 47.0105,
  longitude: 28.8638,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export default function MapScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<MapPoint | null>(null);

  const { data: points, isLoading } = useQuery({
    queryKey: ["map", "points"],
    queryFn: async () => {
      // Only venues carry geocoordinates (lat/lng columns). Artists have no
      // lat/lng in the schema, so they can never produce a map marker — we
      // therefore fetch venues only. The list endpoint returns raw DB rows,
      // so we map each row's real columns (nameRo, city, isFeatured) into the
      // MapPoint shape explicitly rather than spreading mismatched fields.
      const venuesRes = await publicApi.get<{ items: VenueListItem[] }>(
        "/venues",
        { query: { limit: 100 } },
      );
      const allPoints: MapPoint[] = (venuesRes.data?.items ?? []).map((v) => ({
        id: v.id,
        type: "venue" as const,
        name: v.nameRo,
        slug: v.slug,
        // Venues have no `isPremium` column; `isFeatured` is the premium flag.
        isPremium: v.isFeatured ?? false,
        lat: v.lat ?? null,
        lng: v.lng ?? null,
        city: v.city ?? null,
      }));
      // Keep only venues that have actually been geocoded.
      return allPoints.filter((p) => p.lat != null && p.lng != null);
    },
  });

  const markers = useMemo(() => points ?? [], [points]);

  return (
    <View className="flex-1 bg-background">
      <MapView
        style={{ flex: 1 }}
        initialRegion={DEFAULT_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
      >
        {markers.map((p) => (
          <Marker
            key={`${p.type}-${p.id}`}
            coordinate={{ latitude: p.lat!, longitude: p.lng! }}
            onPress={() => setSelected(p)}
            pinColor={p.isPremium ? colors.gold : colors.mutedForeground}
            title={p.name}
            description={p.city ?? undefined}
          />
        ))}
      </MapView>

      {/* Floating back button */}
      <SafeAreaView
        edges={["top"]}
        className="absolute inset-x-0 top-0"
        pointerEvents="box-none"
      >
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-background/90 backdrop-blur"
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          {isLoading && <ActivityIndicator color={colors.gold} />}
        </View>
      </SafeAreaView>

      {/* Bottom sheet (simple version) */}
      {selected && (
        <SafeAreaView edges={["bottom"]} className="absolute inset-x-0 bottom-0">
          <View className="mx-4 mb-3 rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-gold/15">
                <MapPin size={20} color={colors.gold} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-foreground">
                  {selected.name}
                </Text>
                <Text className="text-[12px] text-muted-foreground">
                  {selected.type === "artist" ? "Artist" : "Sală"}
                  {selected.city ? ` · ${selected.city}` : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setSelected(null);
                  router.push(
                    selected.type === "artist"
                      ? `/(client)/artist/${selected.slug}`
                      : `/(client)/venue/${selected.slug}`,
                  );
                }}
                className="rounded-lg bg-gold px-3 py-2"
              >
                <Text className="text-[12px] font-semibold text-background">
                  Vezi
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}
