// Tarife (pricing packages) CRUD screen.
//
// List of artist's pricing packages. Tap one → edit sheet. Tap "+"
// → add new. Long-press → delete confirm.

import { useState } from "react";
import { View, Text, Pressable, FlatList, Modal, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Plus, X, Trash2, Edit2 } from "lucide-react-native";
import { Card, Button, Input } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";

interface Package {
  id: number;
  nameRo: string;
  descriptionRo: string | null;
  price: number;
  durationHours: number | null;
}

export default function TarifeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const artistId = Number(id);
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const pkgsQuery = useQuery({
    queryKey: ["artist-packages", artistId],
    enabled: Number.isFinite(artistId),
    queryFn: async () => {
      const res = await api.get<Package[]>(
        `/artist-packages?artist_id=${artistId}`,
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pkgId: number) => {
      const res = await api.delete(`/artist-packages/${pkgId}`);
      if (!res.ok) throw new Error("delete_failed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["artist-packages", artistId] });
    },
  });

  function handleDelete(pkg: Package) {
    Alert.alert(
      "Șterge pachetul",
      `Sigur ștergi "${pkg.nameRo}"?`,
      [
        { text: "Anulează", style: "cancel" },
        {
          text: "Șterge",
          style: "destructive",
          onPress: () => deleteMutation.mutate(pkg.id),
        },
      ],
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]}>
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text className="flex-1 font-heading text-[18px] font-bold text-foreground">
            Pachete & Tarife
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => setShowAdd(true)}
            className="h-10 w-10 items-center justify-center rounded-full bg-gold"
          >
            <Plus size={20} color={colors.background} />
          </Pressable>
        </View>
      </SafeAreaView>

      <FlatList
        data={pkgsQuery.data ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 32,
          gap: 12,
        }}
        renderItem={({ item }) => (
          <Card>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-foreground">
                  {item.nameRo}
                </Text>
                {item.descriptionRo && (
                  <Text className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                    {item.descriptionRo}
                  </Text>
                )}
                <View className="mt-1.5 flex-row items-center gap-3">
                  {item.durationHours != null && (
                    <Text className="text-[12px] text-muted-foreground">
                      {item.durationHours}h
                    </Text>
                  )}
                  <Text className="text-[16px] font-bold text-gold">
                    {item.price} €
                  </Text>
                </View>
              </View>
              <View className="gap-1">
                <Pressable
                  hitSlop={6}
                  onPress={() => setEditingPkg(item)}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-card"
                >
                  <Edit2 size={14} color={colors.foreground} />
                </Pressable>
                <Pressable
                  hitSlop={6}
                  onPress={() => handleDelete(item)}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15"
                >
                  <Trash2 size={14} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          pkgsQuery.isLoading ? null : (
            <View className="items-center gap-3 py-16">
              <Text className="font-heading text-[18px] font-bold text-foreground">
                Niciun pachet încă
              </Text>
              <Text className="max-w-[260px] text-center text-[13px] text-muted-foreground">
                Adaugă-ți pachetele tale (Set de 2h, Format complet, etc.) ca să
                le poți propune rapid clienților.
              </Text>
            </View>
          )
        }
      />

      <PackageSheet
        visible={showAdd || editingPkg !== null}
        onDismiss={() => {
          setShowAdd(false);
          setEditingPkg(null);
        }}
        artistId={artistId}
        pkg={editingPkg}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ["artist-packages", artistId] });
          setShowAdd(false);
          setEditingPkg(null);
        }}
      />
    </View>
  );
}

function PackageSheet({
  visible,
  onDismiss,
  artistId,
  pkg,
  onSaved,
}: {
  visible: boolean;
  onDismiss: () => void;
  artistId: number;
  pkg: Package | null;
  onSaved: () => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState(pkg?.nameRo ?? "");
  const [description, setDescription] = useState(pkg?.descriptionRo ?? "");
  const [price, setPrice] = useState(pkg?.price != null ? String(pkg.price) : "");
  const [duration, setDuration] = useState(
    pkg?.durationHours != null ? String(pkg.durationHours) : "",
  );
  const [submitting, setSubmitting] = useState(false);

  // Re-sync when editing different package
  if (pkg && title !== pkg.nameRo && !visible) {
    // no-op — we just want fresh state on next open
  }

  async function handleSave() {
    if (!title.trim() || !price) return;
    setSubmitting(true);
    try {
      const body = {
        nameRo: title.trim(),
        descriptionRo: description.trim() || null,
        price: Number(price),
        durationHours: duration ? Number(duration) : null,
      };
      const res = pkg
        ? await api.put(`/artist-packages/${pkg.id}`, body)
        : await api.post("/artist-packages", { ...body, artistId });
      if (res.ok) {
        onSaved();
        setTitle("");
        setDescription("");
        setPrice("");
        setDuration("");
      } else {
        Alert.alert(
          "Eroare",
          "Pachetul nu a putut fi salvat. Verifică datele și încearcă din nou.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
          <Text className="font-heading text-[18px] font-bold text-foreground">
            {pkg ? "Editează pachet" : "Pachet nou"}
          </Text>
          <Pressable hitSlop={8} onPress={onDismiss}>
            <X size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <View className="gap-3 p-5">
          <Input label="Titlu" value={title} onChangeText={setTitle} autoFocus />
          <Input
            label="Descriere (opțional)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label="Preț (€)"
                value={price}
                onChangeText={(v) => setPrice(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Input
                label="Durata (ore)"
                value={duration}
                onChangeText={(v) => setDuration(v.replace(/\D/g, "").slice(0, 2))}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <Button
            onPress={handleSave}
            loading={submitting}
            fullWidth
            size="lg"
          >
            {pkg ? "Salvează" : "Adaugă"}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
