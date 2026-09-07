// Photo Moments — owner gallery view.
//
// Grid of approved photos. Tap to expand into a swipeable lightbox.
// Toolbar at the top right: QR scanner (camera modal that scans a
// QR code from a printed table card to join an event), upload (pick
// from library), camera (capture new photo).
//
// Photos POST to /api/v1/event-plans/[id]/photos using FormData. Expo
// ImagePicker returns a local URI passed as a native multipart file. We
// then refetch the photo list to show the new entry.

import { useState, useCallback, useEffect } from "react";
import { mediaUrl } from "../../../lib/links";
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
import { useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Camera as CameraIcon,
  ImagePlus,
  Heart,
  X,
  QrCode,
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
  guestName: string | null;
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
  const { getToken, userId } = useAuth();
  const [photoAuth, setPhotoAuth] = useState<{ userId: string; token: string } | null>(null);
  const photoToken = photoAuth && photoAuth.userId === userId ? photoAuth.token : null;
  const qc = useQueryClient();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    let current = true;
    setPhotoAuth(null);
    const refresh = async () => {
      try {
        const token = userId ? await getToken() : null;
        if (current) setPhotoAuth(userId && token ? { userId, token } : null);
      } catch { if (current) setPhotoAuth(null); }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 45_000);
    return () => { current = false; clearInterval(timer); };
  }, [getToken, userId]);

  // Never attach the Clerk credential to a database-provided external URL.
  const photoSource = (photoId: number) => photoToken && Number.isSafeInteger(photoId) && photoId > 0
    ? { uri: mediaUrl(`/api/event-photos/${photoId}/file`)!, headers: { Authorization: `Bearer ${photoToken}` } }
    : undefined;

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
      // The owner-scoped endpoint processes and attaches the file itself.
      // Arbitrary URL attachment is intentionally no longer supported.
      if (asset.fileSize && asset.fileSize > 4 * 1024 * 1024) {
        throw new Error("Fotografia trebuie să aibă maximum 4 MB.");
      }
      const token = await getToken();
      if (!token) throw new Error("not_authenticated");

      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? `photo-${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob);
      const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "https://epetrecere.md/api/v1").replace(/\/$/, "");
      const uploadRes = await fetch(
        `${baseUrl}${API_PATHS.eventPlanPhotos(planId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        },
      );
      if (!uploadRes.ok) throw new Error(uploadRes.status === 413
        ? "Fotografia trebuie să aibă maximum 4 MB."
        : "Fotografia nu a putut fi încărcată. Încearcă din nou.");
      return uploadRes.json();
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
    } catch {
      // The mutation error remains visible below the toolbar.
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
    } catch {
      // The mutation error remains visible below the toolbar.
    } finally {
      setUploading(false);
    }
  }, [permission, requestPermission, uploadMutation]);

  const photos = photosQuery.data ?? [];

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]}>
        <View className="flex-row items-center justify-between gap-3 border-b border-border px-3 py-2">
          <View className="flex-row items-center gap-2">
            <Pressable
              hitSlop={8}
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full"
            >
              <ArrowLeft size={20} color={colors.foreground} />
            </Pressable>
            <Text className="font-heading text-[18px] font-bold text-foreground">
              Photo Moments
            </Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              hitSlop={8}
              onPress={() => router.push("/(client)/moments/scan-result" as never)}
              className="h-10 w-10 items-center justify-center rounded-full bg-card"
            >
              <QrCode size={18} color={colors.gold} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={pickFromLibrary}
              className="h-10 w-10 items-center justify-center rounded-full bg-card"
            >
              <ImagePlus size={18} color={colors.gold} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={captureFromCamera}
              className="h-10 w-10 items-center justify-center rounded-full bg-gold"
            >
              <CameraIcon size={18} color={colors.background} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {uploading && (
        <View className="flex-row items-center justify-center gap-2 bg-gold/15 py-2">
          <ActivityIndicator size="small" color={colors.gold} />
          <Text className="text-[12px] text-gold">Se încarcă pozele…</Text>
        </View>
      )}
      {uploadMutation.isError && (
        <Text accessibilityRole="alert" className="px-4 py-2 text-red-400">
          {uploadMutation.error.message}
        </Text>
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
            style={{ width: CELL_SIZE, height: CELL_SIZE }}
            className="overflow-hidden rounded-lg"
          >
            <Image
              source={photoSource(item.id)}
              cachePolicy="none"
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
              recyclingKey={String(item.id)}
            />
            {item.isFavorite && (
              <View className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/50">
                <Heart size={12} color={colors.gold} fill={colors.gold} />
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          photosQuery.isLoading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.gold} />
            </View>
          ) : (
            <View className="items-center gap-3 py-16">
              <CameraIcon size={48} color={colors.mutedForeground} />
              <Text className="font-heading text-[18px] font-bold text-foreground">
                Niciun moment încă
              </Text>
              <Text className="max-w-[280px] text-center text-[13px] text-muted-foreground">
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
        <View className="flex-1 bg-black">
          <SafeAreaView edges={["top"]}>
            <View className="flex-row justify-end px-4 py-2">
              <Pressable
                hitSlop={8}
                onPress={() => setLightboxIndex(null)}
                className="h-10 w-10 items-center justify-center rounded-full bg-black/60"
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
                    source={photoSource(item.id)}
                    cachePolicy="none"
                    style={{ width: SCREEN_WIDTH, aspectRatio: 1 }}
                    contentFit="contain"
                    transition={200}
                  />
                  {(item.caption || item.guestName) && (
                    <View className="px-6 pt-4">
                      {item.caption && (
                        <Text className="text-center text-[15px] italic text-white/90">
                          “{item.caption}”
                        </Text>
                      )}
                      {item.guestName && (
                        <Text className="mt-2 text-center text-[12px] text-white/60">
                          — {item.guestName}
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
    </View>
  );
}
