// Reject-booking sheet.

import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, XCircle } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Input, Card } from "../../../../components/ui";
import { colors } from "../../../../constants/theme";
import { useApi } from "../../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

export default function RejectBookingSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Number(id);
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();

  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(API_PATHS.bookingRequest(bookingId), {
        action: "reject",
        reply: reply.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error?.message ?? "reject_failed");
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
          className="flex-row items-center gap-2 border-b border-border px-3 py-2"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
            }}
          >
            <X size={20} color={colors.foreground} />
          </Pressable>
          <Text
            className="font-heading text-[18px] font-bold text-foreground"
            style={{ fontFamily: "Cormorant", fontSize: 18, fontWeight: "700", color: colors.foreground }}
          >
            Refuză cererea
          </Text>
        </View>
      </SafeAreaView>

      <View className="gap-4 p-5" style={{ gap: 16, padding: 20 }}>
        <Card
          className="border-rose-500/30 bg-rose-500/5"
          style={{ borderColor: "rgba(244,63,94,0.3)", backgroundColor: "rgba(244,63,94,0.05)" }}
        >
          <View
            className="flex-row items-start gap-3"
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
          >
            <XCircle size={22} color={colors.danger} />
            <View className="flex-1" style={{ flex: 1 }}>
              <Text
                className="text-[14px] font-semibold text-foreground"
                style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
              >
                Vei refuza această cerere
              </Text>
              <Text
                className="mt-1 text-[12px] leading-5 text-muted-foreground"
                style={{ marginTop: 4, fontSize: 12, lineHeight: 20, color: colors.mutedForeground }}
              >
                Clientul va fi notificat. Spune-i pe scurt de ce — ajută la
                relația cu următorii care vin.
              </Text>
            </View>
          </View>
        </Card>

        <Input
          label="Motiv (opțional)"
          value={reply}
          onChangeText={setReply}
          error={error}
          multiline
          numberOfLines={4}
          hint="Ex: ocupat pe data respectivă, sub bugetul minim, locație prea departe."
        />

        <Button
          variant="danger"
          onPress={() => rejectMutation.mutate()}
          loading={rejectMutation.isPending}
          fullWidth
          size="lg"
          leftIcon={<XCircle size={18} color="#fff" />}
        >
          Refuză cererea
        </Button>
        <Button
          variant="ghost"
          onPress={() => router.back()}
          fullWidth
          size="md"
        >
          Anulează
        </Button>
      </View>
    </View>
  );
}
