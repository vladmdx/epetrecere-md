// Photo Moments — owner gallery view.
//
// Grid of approved photos. Tap to expand into a swipeable lightbox.
// Toolbar at the top right: QR scanner (camera modal that scans a
// QR code from a printed table card to join an event), upload (pick
// from library), camera (capture new photo).
//
// Photos POST to /api/v1/event-plans/[id]/photos using FormData. Expo
// ImagePicker returns a local URI which we wrap in a Blob fetch. We
// then refetch the photo list to show the new entry.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Camera as CameraIcon,
  ImagePlus,
  QrCode,
  Heart,
  X,
} from "lucide-react-native";
import { Button } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_COLS = 3;
const GRID_GAP = 4;
const CELL_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS - 1) - 32) / GRID_COLS;

interface Photo {
  id: number;
  url: string;
  thumbUrl: string | null;
  uploaderName: string | null;
  caption: string | null;
  isFavorite: boolean;
  isApproved: boolean;
  createdAt: string;
}

export default function MomentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const planId = Number(id);
  const router = useRouter();
  const api = useApi();
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const photosQuery = useQuery({
    queryKey: ["plan", planId, "photos"],
    enabled: Number.isFinite(planId),
    queryFn: async () => {
      const res = await api.get<{ photos: Photo[] }>(
        API_PATHS.eventPlanPhotos(planId),
      );
      return res.data?.photos ?? [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (asset: ImagePicker.ImagePickerAsset) => {
      // Two-step upload:
      //   1) POST the file as multipart to /api/v1/upload — server returns
      //      the persisted URL (Vercel Blob or local fs depending on env).
      //   2) POST the URL to /api/v1/event-plans/[id]/photos as JSON.
      // This is cleaner than streaming through the photos endpoint
      // because /upload already handles MIME validation + rate limit.
      const token = await getToken();
      if (!token) throw new Error("not_authenticated");

      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? `photo-${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob);
      form.append("folder", "uploads");

      const uploadRes = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        },
      );
      if (!uploadRes.ok) throw new Error(`upload_failed_${uploadRes.status}`);
      const { url } = (await uploadRes.json()) as { url: string };

      // Now register the photo with the event plan
      const registerRes = await api.post(API_PATHS.eventPlanPhotos(planId), {
        url,
        width: asset.width,
        height: asset.height,
      });
      if (!registerRes.ok) throw new Error("register_failed");
      return registerRes.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plan", planId, "photos"] });
    },
  });

  const pickFromLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    setUploading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });
      if (result.canceled) return;
      for (const asset of result.assets) {
        await uploadMutation.mutateAsync(asset);
      }
    } finally {
      setUploading(false);
    }
  }, [uploadMutation]);

  const captureFromCamera = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setUploading(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset) await uploadMutation.mutateAsync(asset);
    } finally {
      setUploading(false);
    }
  }, [permission, requestPermission, uploadMutation]);

  const onQrScanned = useCallback(
    (result: BarcodeScanningResult) => {
      setShowScanner(false);
      // QR codes encode /moments/<slug> URLs. We extract slug and
      // navigate to the public upload view (signed-in users see it
      // as a regular photos upload, anonymous via the web flow).
      const m = result.data.match(/\/moments\/([a-z0-9-]+)/i);
      if (m) {
        router.push({
          pathname: "/(client)/moments/scan-result",
          params: { slug: m[1] },
        } as never);
      }
    },
    [router],
  );

  const photos = photosQuery.data ?? [];

  return (
    <View className="flex-1 bg-background" style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]}>
        <View
          className="flex-row items-center justify-between gap-3 border-b border-border px-3 py-2"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <View className="flex-row items-center gap-2" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              hitSlop={8}
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999 }}
            >
              <ArrowLeft size={20} color={colors.foreground} />
            </Pressable>
            <Text
              className="font-heading text-[18px] font-bold text-foreground"
              style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}
            >
              Photo Moments
            </Text>
          </View>
          <View className="flex-row gap-2" style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              hitSlop={8}
              onPress={() => setShowScanner(true)}
              className="h-10 w-10 items-center justify-center rounded-full bg-card"
              style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: colors.card }}
            >
              <QrCode size={18} color={colors.gold} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={pickFromLibrary}
              className="h-10 w-10 items-center justify-center rounded-full bg-card"
              style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: colors.card }}
            >
              <ImagePlus size={18} color={colors.gold} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={captureFromCamera}
              className="h-10 w-10 items-center justify-center rounded-full bg-gold"
              style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: colors.gold }}
            >
              <CameraIcon size={18} color={colors.background} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {uploading && (
        <View
          className="flex-row items-center justify-center gap-2 bg-gold/15 py-2"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: "rgba(201,168,76,0.15)",
            paddingVertical: 8,
          }}
        >
          <ActivityIndicator size="small" color={colors.gold} />
          <Text className="text-[12px] text-gold" style={{ fontSize: 12, color: colors.gold }}>
            Se încarcă pozele…
          </Text>
        </View>
      )}

      <FlatList
        data={photos}
        keyExtractor={(p) => String(p.id)}
        numColumns={GRID_COLS}
        columnWrapperStyle={{ gap: GRID_GAP }}
        contentContainerStyle={{
          padding: 16,
          gap: GRID_GAP,
        }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => setLightboxIndex(index)}
            style={[{ overflow: "hidden", borderRadius: 14 }, { width: CELL_SIZE, height: CELL_SIZE }]}
            className="overflow-hidden rounded-lg"
          >
            <Image
              source={{ uri: item.thumbUrl ?? item.url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
              recyclingKey={String(item.id)}
            />
            {item.isFavorite && (
              <View
                className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/50"
                style={{
                  position: "absolute",
                  right: 4,
                  top: 4,
                  height: 24,
                  width: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 9999,
                  backgroundColor: "rgba(0,0,0,0.5)",
                }}
              >
                <Heart size={12} color={colors.gold} fill={colors.gold} />
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          photosQuery.isLoading ? (
            <View className="items-center py-16" style={{ alignItems: "center", paddingVertical: 64 }}>
              <ActivityIndicator color={colors.gold} />
            </View>
          ) : (
            <View className="items-center gap-3 py-16" style={{ alignItems: "center", gap: 12, paddingVertical: 64 }}>
              <CameraIcon size={48} color={colors.mutedForeground} />
              <Text
                className="font-heading text-[18px] font-bold text-foreground"
                style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}
              >
                Niciun moment încă
              </Text>
              <Text
                className="max-w-[280px] text-center text-[13px] text-muted-foreground"
                style={{ maxWidth: 280, textAlign: "center", fontSize: 13, color: colors.mutedForeground }}
              >
                Apasă pe camera de mai sus să adaugi prima poză sau invită oaspeții cu QR-ul evenimentului.
              </Text>
              <Button variant="outline" size="md" onPress={pickFromLibrary}>
                Încarcă din galerie
              </Button>
            </View>
          )
        }
      />

      {/* Lightbox */}
      <Modal
        visible={lightboxIndex !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setLightboxIndex(null)}
      >
        <View className="flex-1 bg-black" style={{ flex: 1, backgroundColor: "#000" }}>
          <SafeAreaView edges={["top"]}>
            <View
              className="flex-row justify-end px-4 py-2"
              style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Pressable
                hitSlop={8}
                onPress={() => setLightboxIndex(null)}
                className="h-10 w-10 items-center justify-center rounded-full bg-black/60"
                style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "rgba(0,0,0,0.6)" }}
              >
                <X size={20} color="#fff" />
              </Pressable>
            </View>
          </SafeAreaView>
          {lightboxIndex !== null && photos[lightboxIndex] && (
            <FlatList
              data={photos}
              keyExtractor={(p) => `lb-${p.id}`}
              horizontal
              pagingEnabled
              initialScrollIndex={lightboxIndex}
              getItemLayout={(_, i) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * i,
                index: i,
              })}
              renderItem={({ item }) => (
                <View
                  style={{
                    width: SCREEN_WIDTH,
                    flex: 1,
                    justifyContent: "center",
                  }}
                >
                  <Image
                    source={{ uri: item.url }}
                    style={{ width: SCREEN_WIDTH, aspectRatio: 1 }}
                    contentFit="contain"
                    transition={200}
                  />
                  {(item.caption || item.uploaderName) && (
                    <View className="px-6 pt-4" style={{ paddingHorizontal: 24, paddingTop: 16 }}>
                      {item.caption && (
                        <Text
                          className="text-center text-[15px] italic text-white/90"
                          style={{ textAlign: "center", fontSize: 15, fontStyle: "italic", color: "rgba(255,255,255,0.9)" }}
                        >
                          “{item.caption}”
                        </Text>
                      )}
                      {item.uploaderName && (
                        <Text
                          className="mt-2 text-center text-[12px] text-white/60"
                          style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.6)" }}
                        >
                          — {item.uploaderName}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </View>
      </Modal>

      {/* QR scanner */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => setShowScanner(false)}
      >
        <View className="flex-1 bg-black" style={{ flex: 1, backgroundColor: "#000" }}>
          {permission?.granted ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={onQrScanned}
            />
          ) : (
            <SafeAreaView
              className="flex-1 items-center justify-center gap-4 p-6"
              style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}
            >
              <Text
                className="font-heading text-[20px] font-bold text-white"
                style={{ fontSize: 20, fontWeight: "700", color: "#fff" }}
              >
                Permite accesul la cameră
              </Text>
              <Text
                className="text-center text-[13px] text-white/70"
                style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.7)" }}
              >
                Pentru a scana QR-ul de pe masa evenimentului.
              </Text>
              <Button onPress={requestPermission} fullWidth size="lg">
                Permite
              </Button>
            </SafeAreaView>
          )}
          <SafeAreaView
            edges={["top"]}
            className="absolute inset-x-0 top-0"
            style={{ position: "absolute", left: 0, right: 0, top: 0 }}
          >
            <View
              className="flex-row items-center justify-between px-4 py-2"
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Pressable
                hitSlop={8}
                onPress={() => setShowScanner(false)}
                className="h-10 w-10 items-center justify-center rounded-full bg-black/60"
                style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "rgba(0,0,0,0.6)" }}
              >
                <X size={20} color="#fff" />
              </Pressable>
              <View
                className="rounded-full bg-black/60 px-3 py-1"
                style={{ borderRadius: 9999, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 4 }}
              >
                <Text className="text-[12px] text-white" style={{ fontSize: 12, color: "#fff" }}>
                  Scanează codul QR de la masa ta
                </Text>
              </View>
              <View className="w-10" style={{ width: 40 }} />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
