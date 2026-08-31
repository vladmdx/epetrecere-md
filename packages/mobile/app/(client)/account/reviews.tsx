// Leave a review — lists the client's completed (confirmed) bookings that
// haven't been reviewed yet (GET /reviews/reviewable-bookings) and lets them
// submit a 1–5★ rating + optional comment (POST /reviews/from-booking).

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star } from "lucide-react-native";
import { SafeScreen, Card, Button, Input } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi, unwrap } from "../../../lib/api";
import { formatDateRO } from "@epetrecere/shared/utils";

interface Reviewable {
  id: number;
  artistName: string | null;
  eventDate: string;
  eventType?: string | null;
}

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={4}>
          <Star
            size={30}
            color={colors.gold}
            fill={n <= value ? colors.gold : "transparent"}
          />
        </Pressable>
      ))}
    </View>
  );
}

export default function ReviewsScreen() {
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [comments, setComments] = useState<Record<number, string>>({});

  const q = useQuery({
    queryKey: ["reviewable-bookings"],
    queryFn: async () => {
      const res = await api.get<{ items: Reviewable[] }>(
        "/reviews/reviewable-bookings",
      );
      return res.data?.items ?? [];
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (bookingId: number) => {
      const res = await api.post("/reviews/from-booking", {
        bookingId,
        rating: ratings[bookingId],
        comment: comments[bookingId]?.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error?.message ?? "submit_failed");
      return unwrap(res);
    },
    onSuccess: () => {
      Alert.alert("Mulțumim!", "Recenzia ta a fost trimisă.");
      void qc.invalidateQueries({ queryKey: ["reviewable-bookings"] });
    },
    onError: () => {
      Alert.alert("Eroare", "Nu am putut trimite recenzia. Încearcă din nou.");
    },
  });

  const items = q.data ?? [];

  return (
    <SafeScreen padded scroll={false}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 8,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground }}>
          Lasă o recenzie
        </Text>
      </View>

      {q.isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : items.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingBottom: 80,
          }}
        >
          <Star size={40} color={colors.mutedForeground} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
            Nicio rezervare de recenzat
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
            Vei putea lăsa o recenzie după ce o rezervare confirmată se încheie.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 12, paddingTop: 12, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={() => q.refetch()}
              tintColor={colors.gold}
            />
          }
        >
          {items.map((b) => (
            <Card key={b.id} style={{ gap: 12 }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                  {b.artistName ?? "Artist"}
                </Text>
                <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                  {formatDateRO(b.eventDate)}
                </Text>
              </View>

              <Stars
                value={ratings[b.id] ?? 0}
                onChange={(n) => setRatings((r) => ({ ...r, [b.id]: n }))}
              />

              <Input
                label="Comentariu (opțional)"
                value={comments[b.id] ?? ""}
                onChangeText={(v) => setComments((c) => ({ ...c, [b.id]: v }))}
                multiline
              />

              <Button
                onPress={() => submitMutation.mutate(b.id)}
                loading={submitMutation.isPending && submitMutation.variables === b.id}
                disabled={!ratings[b.id]}
                fullWidth
              >
                Trimite recenzia
              </Button>
            </Card>
          ))}
        </ScrollView>
      )}
    </SafeScreen>
  );
}
