// Map view of artists + venues.
//
// react-native-maps with the Google provider (set via app.json
// android.googleMapsApiKey + ios.config.googleMapsApiKey when we
// have the API key).
//
// Markers are tinted gold for premium / muted for standard. Tap a
// marker → bottom sheet (BottomSheet from @gorhom — we'll add it in
// a later milestone) → quick preview + "Vezi profil" CTA.
//
// Note: this screen requires Google Maps API key in EAS env. Without
// it Android renders a blank grey area but iOS uses Apple Maps as
// fallback. We document this in README.

import { useState, useMemo } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
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
      // The artists + venues endpoints return lat/lng when the entity
      // has been geocoded. We hit both in parallel and merge.
      const [artistsRes, venuesRes] = await Promise.all([
        publicApi.get<{ items: MapPoint[] }>("/artists", {
          query: { hasLocation: 1, limit: 100 },
        }),
        publicApi.get<{ items: MapPoint[] }>("/venues", {
          query: { hasLocation: 1, limit: 100 },
        }),
      ]);
      const allPoints = [
        ...(artistsRes.data?.items ?? []).map((a) => ({
          ...a,
          type: "artist" as const,
        })),
        ...(venuesRes.data?.items ?? []).map((v) => ({
          ...v,
          type: "venue" as const,
        })),
      ];
      return allPoints.filter((p) => p.lat != null && p.lng != null);
    },
  });

  const markers = useMemo(() => points ?? [], [points]);

  return (
    <View
      className="flex-1 bg-background"
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <MapView
        provider={PROVIDER_GOOGLE}
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
        style={{ position: "absolute", left: 0, right: 0, top: 0 }}
        pointerEvents="box-none"
      >
        <View
          className="flex-row items-center justify-between px-4 py-2"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-background/90 backdrop-blur"
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              backgroundColor: "rgba(13,13,13,0.9)",
            }}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          {isLoading && <ActivityIndicator color={colors.gold} />}
        </View>
      </SafeAreaView>

      {/* Bottom sheet (simple version) */}
      {selected && (
        <SafeAreaView
          edges={["bottom"]}
          className="absolute inset-x-0 bottom-0"
          style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
        >
          <View
            className="mx-4 mb-3 rounded-2xl border border-border bg-card p-4"
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 16,
            }}
          >
            <View
              className="flex-row items-center gap-3"
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-full bg-gold/15"
                style={{
                  height: 40,
                  width: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 9999,
                  backgroundColor: "rgba(201,168,76,0.15)",
                }}
              >
                <MapPin size={20} color={colors.gold} />
              </View>
              <View className="flex-1" style={{ flex: 1 }}>
                <Text
                  className="text-[15px] font-semibold text-foreground"
                  style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}
                >
                  {selected.name}
                </Text>
                <Text
                  className="text-[12px] text-muted-foreground"
                  style={{ fontSize: 12, color: colors.mutedForeground }}
                >
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
                style={{
                  borderRadius: 14,
                  backgroundColor: colors.gold,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text
                  className="text-[12px] font-semibold text-background"
                  style={{ fontSize: 12, fontWeight: "600", color: colors.background }}
                >
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
