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
  /**
   * Artists told us their real pricing is per event and per event type, not
   * per hour. The server has stored both since per-event pricing shipped; the
   * app was still typed as if only the hourly tier existed, so a partner who
   * edited any tariff from the phone silently converted it back to hourly.
   */
  pricingMode: "per_hour" | "per_event" | null;
  eventType: string | null;
}

/** Ordered as a partner thinks about them, matching the web wizard. */
const EVENT_TYPES: { key: string; label: string }[] = [
  { key: "wedding", label: "Nuntă" },
  { key: "proposal", label: "Cerere în căsătorie" },
  { key: "cununie", label: "Cununie" },
  { key: "baptism", label: "Botez" },
  { key: "cumatrie", label: "Cumătrie" },
  { key: "birthday", label: "Aniversare" },
  { key: "kids_birthday", label: "Aniversare copii" },
  { key: "corporate", label: "Corporate" },
  { key: "concert", label: "Concert / Petrecere" },
  { key: "other", label: "Alt tip" },
];

/** A null event type means "orice eveniment" — what every older row means. */
function eventTypeLabel(key: string | null): string {
  return EVENT_TYPES.find((t) => t.key === key)?.label ?? "Orice eveniment";
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
                    <Text className="text-[12px] font-normal text-muted-foreground">
                      {item.pricingMode === "per_event" ? " / eveniment" : " / oră"}
                    </Text>
                  </Text>
                </View>
                <Text className="mt-1 text-[12px] text-muted-foreground">
                  {eventTypeLabel(item.eventType)}
                </Text>
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

      {/*
        Mounted only while open, and keyed by the package being edited.
        Before this, the sheet was mounted from the first render, so its
        `useState` initialisers ran once — while `pkg` was still null. Tapping
        edit reused that blank state, and saving wrote the empty form over a
        real tariff. The key makes React discard the state between packages,
        which is what the dead "re-sync" no-op below was reaching for.
      */}
      {(showAdd || editingPkg !== null) && (
      <PackageSheet
        key={editingPkg?.id ?? "new"}
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
      )}
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
  const [mode, setMode] = useState<"per_hour" | "per_event">(
    pkg?.pricingMode === "per_event" ? "per_event" : "per_hour",
  );
  const [eventType, setEventType] = useState<string | null>(
    pkg?.eventType ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    if (!title.trim() || !price) return;
    setSubmitting(true);
    try {
      const body = {
        nameRo: title.trim(),
        descriptionRo: description.trim() || null,
        price: Number(price),
        durationHours: duration ? Number(duration) : null,
        pricingMode: mode,
        // Explicitly null, not omitted: null is how the server stores "any
        // event", so clearing the picker has to reach it as a value.
        eventType,
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
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              Cum tarifezi
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(
                [
                  ["per_hour", "Pe oră"],
                  ["per_event", "Pe eveniment"],
                ] as const
              ).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setMode(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: mode === value }}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 12,
                    borderWidth: 1,
                    alignItems: "center",
                    borderColor: mode === value ? colors.gold : colors.border,
                    backgroundColor:
                      mode === value ? colors.gold + "1A" : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color:
                        mode === value ? colors.gold : colors.mutedForeground,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              Pentru ce eveniment
            </Text>
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
            >
              {[{ key: null, label: "Orice eveniment" }, ...EVENT_TYPES].map(
                (t) => {
                  const on = eventType === t.key;
                  return (
                    <Pressable
                      key={t.key ?? "any"}
                      onPress={() => setEventType(t.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={{
                        paddingHorizontal: 13,
                        paddingVertical: 8,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: on ? colors.gold : colors.border,
                        backgroundColor: on
                          ? colors.gold + "1A"
                          : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: on ? colors.gold : colors.mutedForeground,
                          fontWeight: on ? "600" : "400",
                        }}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>
          </View>

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
                label={
                  mode === "per_event" ? "Durata medie (ore)" : "Durata (ore)"
                }
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
