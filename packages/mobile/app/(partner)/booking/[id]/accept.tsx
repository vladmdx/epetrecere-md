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
import { useApi, unwrap } from "../../../../lib/api";
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
      return unwrap(res);
    },
    onSuccess: () => {
      // The screen we are returning to reads ["partner-booking", id]. Without
      // this it still shows "Nouă" with the accept/reject buttons live, and
      // pressing one again answers 409 — the partner is told their own action
      // failed, seconds after it worked.
      void qc.invalidateQueries({ queryKey: ["partner-booking", bookingId] });
      void qc.invalidateQueries({ queryKey: ["partner-bookings"] });
      void qc.invalidateQueries({ queryKey: ["partner-dashboard"] });
      router.back();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "A apărut o eroare");
    },
  });

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]}>
        <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
          <View className="flex-row items-center gap-2">
            <Pressable
              hitSlop={8}
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full"
            >
              <X size={20} color={colors.foreground} />
            </Pressable>
            <Text className="font-heading text-[18px] font-bold text-foreground">
              Acceptă cererea
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <View className="gap-4 p-5">
        <Card className="bg-emerald-500/5 border-emerald-500/30">
          <View className="flex-row items-start gap-3">
            <CheckCircle size={22} color={colors.success} />
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-foreground">
                Cererea va fi marcată ca acceptată
              </Text>
              <Text className="mt-1 text-[12px] leading-5 text-muted-foreground">
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
          multiline
          numberOfLines={4}
        />

        {/* The server's refusal, on its own line. It used to be passed as

            the message field's `error`, which drew a red border round that

            input and read as "your message is wrong" — for failures like

            "only pending requests can be accepted", which have nothing to

            do with anything the partner typed. */}

        {error && (

          <Text style={{ color: colors.danger, fontSize: 13.5, lineHeight: 19 }}>

            {error}

          </Text>

        )}


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
