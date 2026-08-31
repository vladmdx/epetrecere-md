// Propose-price sheet — counter-offer flow.

import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ArrowLeftRight } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Input, Card } from "../../../../components/ui";
import { colors } from "../../../../constants/theme";
import { useApi, unwrap } from "../../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

export default function ProposePriceSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Number(id);
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();

  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const proposeMutation = useMutation({
    mutationFn: async () => {
      if (!amount) {
        setError("Introdu suma propusă");
        throw new Error("missing_amount");
      }
      const res = await api.put(API_PATHS.bookingRequest(bookingId), {
        action: "propose_price",
        agreedPrice: Number(amount),
        reply: message.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error?.message ?? "propose_failed");
      return unwrap(res);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["partner-bookings"] });
      void qc.invalidateQueries({ queryKey: ["partner-dashboard"] });
      router.back();
    },
    onError: (err) => {
      if (err instanceof Error && err.message !== "missing_amount") {
        setError(err.message);
      }
    },
  });

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]}>
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
          >
            <X size={20} color={colors.foreground} />
          </Pressable>
          <Text className="font-heading text-[18px] font-bold text-foreground">
            Propune un preț
          </Text>
        </View>
      </SafeAreaView>

      <View className="gap-4 p-5">
        <Card className="border-gold/30 bg-gold/5">
          <View className="flex-row items-start gap-3">
            <ArrowLeftRight size={22} color={colors.gold} />
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-foreground">
                Contraofertă către client
              </Text>
              <Text className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Cererea rămâne deschisă. Clientul vede oferta ta și poate
                accepta, refuza sau veni cu o altă propunere.
              </Text>
            </View>
          </View>
        </Card>

        <Input
          label="Suma propusă (€)"
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          error={error}
          autoFocus
        />

        <Input
          label="Notă pentru client (opțional)"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={4}
          hint="Explică ce include suma: orele, deplasarea, echipa."
        />

        <Button
          onPress={() => proposeMutation.mutate()}
          loading={proposeMutation.isPending}
          fullWidth
          size="lg"
          leftIcon={<ArrowLeftRight size={18} color={colors.background} />}
        >
          Trimite contraoferta
        </Button>
      </View>
    </View>
  );
}
