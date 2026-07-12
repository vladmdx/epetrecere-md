// Accept-booking sheet.
//
// Asks the artist for the final agreed price + optional reply message.
// Posts to PUT /api/v1/booking-requests/[id] with action="accept".

import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, CheckCircle } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Input, Card } from "../../../../components/ui";
import { colors } from "../../../../constants/theme";
import { useApi } from "../../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

export default function AcceptBookingSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Number(id);
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();

  const [price, setPrice] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(API_PATHS.bookingRequest(bookingId), {
        action: "accept",
        reply: reply.trim() || undefined,
        agreedPrice: price ? Number(price) : undefined,
      });
      if (!res.ok) throw new Error(res.error?.message ?? "accept_failed");
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["partner-bookings"] });
      void qc.invalidateQueries({ queryKey: ["partner-dashboard"] });
      router.back();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "A apărut o eroare");
    },
  });

  return (
    <View className="flex-1 bg-background" style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]}>
        <View
          className="flex-row items-center justify-between border-b border-border px-3 py-2"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderColor: colors.border,
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
              <X size={20} color={colors.foreground} />
            </Pressable>
            <Text
              className="font-heading text-[18px] font-bold text-foreground"
              style={{ fontFamily: "Cormorant", fontSize: 18, fontWeight: "700", color: colors.foreground }}
            >
              Acceptă cererea
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <View className="gap-4 p-5" style={{ gap: 16, padding: 20 }}>
        <Card
          className="bg-emerald-500/5 border-emerald-500/30"
          style={{ backgroundColor: "rgba(16,185,129,0.05)", borderColor: "rgba(16,185,129,0.3)" }}
        >
          <View className="flex-row items-start gap-3" style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <CheckCircle size={22} color={colors.success} />
            <View className="flex-1" style={{ flex: 1 }}>
              <Text
                className="text-[14px] font-semibold text-foreground"
                style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
              >
                Cererea va fi marcată ca acceptată
              </Text>
              <Text
                className="mt-1 text-[12px] leading-5 text-muted-foreground"
                style={{ marginTop: 4, fontSize: 12, lineHeight: 20, color: colors.mutedForeground }}
              >
                Clientul va primi o notificare să confirme. Până atunci,
                disponibilitatea ta în calendar va fi rezervată provizoriu.
              </Text>
            </View>
          </View>
        </Card>

        <Input
          label="Preț final (€)"
          value={price}
          onChangeText={(v) => setPrice(v.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          hint="Opțional. Dacă a fost propus un preț, îl putem refolosi."
        />

        <Input
          label="Mesaj pentru client (opțional)"
          value={reply}
          onChangeText={setReply}
          error={error}
          multiline
          numberOfLines={4}
        />

        <Button
          onPress={() => acceptMutation.mutate()}
          loading={acceptMutation.isPending}
          fullWidth
          size="lg"
          leftIcon={<CheckCircle size={18} color={colors.background} />}
        >
          Acceptă cererea
        </Button>
      </View>
    </View>
  );
}
