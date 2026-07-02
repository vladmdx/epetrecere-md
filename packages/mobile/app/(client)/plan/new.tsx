// Create a new event plan from the client cabinet (the empty-state CTA).
//
// This is the mobile counterpart of the web /planifica wizard, kept minimal:
// title, event type, date, guests, budget, and whether a venue is needed.
// Services/checklist/etc. are configured afterwards from the plan detail.
//
// Sends only the fields the POST /api/v1/event-plans handler actually
// persists (its local createPlanSchema — NOT the shared EventPlanCreateSchema,
// whose *_enabled fields the handler silently ignores). On success we go
// straight into the new plan and refresh the cabinet's active-plan query.

import { useState } from "react";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { X, Calendar, Users, Wallet, Building2 } from "lucide-react-native";
import { Button, Input, Card } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared";
import { eventTypeLabel, formatDateRO } from "@epetrecere/shared/utils";

const EVENT_TYPES = [
  "wedding",
  "baptism",
  "cumatrie",
  "corporate",
  "birthday",
  "concert",
  "other",
] as const;

export default function PlanNewScreen() {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [eventType, setEventType] =
    useState<(typeof EVENT_TYPES)[number]>("wedding");
  const [eventDate, setEventDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 60); // default ~2 months out
    return d;
  });
  const [guestCount, setGuestCount] = useState("");
  const [budget, setBudget] = useState("");
  const [venueNeeded, setVenueNeeded] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (trimmed.length < 2) {
        throw new Error("Dă un titlu evenimentului (minim 2 caractere).");
      }
      // Build the body manually — only the fields the server persists.
      const guests = Number(guestCount);
      const budgetVal = Number(budget);
      const res = await api.post<{ plan: { id: number } }>(
        API_PATHS.eventPlans,
        {
          title: trimmed,
          eventType,
          eventDate: eventDate.toISOString().slice(0, 10),
          guestCountTarget:
            guestCount && guests > 0 ? guests : undefined,
          budgetTarget: budget && budgetVal >= 0 ? budgetVal : undefined,
          venueNeeded,
        },
      );
      if (!res.ok || !res.data?.plan?.id) {
        throw new Error(res.error?.message ?? "Nu s-a putut crea planul.");
      }
      return res.data.plan;
    },
    onSuccess: (plan) => {
      // Refresh the cabinet's active-plan list so it shows the new plan.
      queryClient.invalidateQueries({ queryKey: ["my", "event-plans", "active"] });
      router.replace(`/(client)/plan/${plan.id}`);
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
              Eveniment nou
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 32,
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <Input
          label="Titlul evenimentului"
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (error) setError(null);
          }}
          hint="Ex: Nunta Anei & lui Ion"
        />

        {/* Event type */}
        <View>
          <Text className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Tip eveniment
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {EVENT_TYPES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setEventType(t)}
                className={`rounded-full border px-4 py-2 ${
                  eventType === t
                    ? "border-gold bg-gold/15"
                    : "border-border bg-card"
                }`}
              >
                <Text
                  className={`text-[13px] font-semibold ${
                    eventType === t ? "text-gold" : "text-foreground/80"
                  }`}
                >
                  {eventTypeLabel(t)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Date */}
        <Pressable onPress={() => setShowDatePicker(true)}>
          <Card className="flex-row items-center gap-3">
            <Calendar size={20} color={colors.gold} />
            <View className="flex-1">
              <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Data evenimentului
              </Text>
              <Text className="mt-0.5 text-[15px] font-semibold text-foreground">
                {formatDateRO(eventDate.toISOString().slice(0, 10))}
              </Text>
            </View>
          </Card>
        </Pressable>

        {/* Guests */}
        <Input
          label="Număr invitați (opțional)"
          value={guestCount}
          onChangeText={(v) => setGuestCount(v.replace(/\D/g, "").slice(0, 4))}
          keyboardType="number-pad"
          rightSlot={<Users size={18} color={colors.mutedForeground} />}
        />

        {/* Budget */}
        <Input
          label="Buget țintă (€, opțional)"
          value={budget}
          onChangeText={(v) => setBudget(v.replace(/\D/g, "").slice(0, 7))}
          keyboardType="number-pad"
          rightSlot={<Wallet size={18} color={colors.mutedForeground} />}
        />

        {/* Venue needed */}
        <View>
          <Text className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Ai nevoie de sală?
          </Text>
          <View className="flex-row gap-8">
            {[
              { value: true, label: "Da, caut sală" },
              { value: false, label: "Nu, am deja" },
            ].map((opt) => (
              <Pressable
                key={String(opt.value)}
                onPress={() => setVenueNeeded(opt.value)}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border px-4 py-3 ${
                  venueNeeded === opt.value
                    ? "border-gold bg-gold/15"
                    : "border-border bg-card"
                }`}
              >
                <Building2
                  size={16}
                  color={venueNeeded === opt.value ? colors.gold : colors.mutedForeground}
                />
                <Text
                  className={`text-[13px] font-semibold ${
                    venueNeeded === opt.value ? "text-gold" : "text-foreground/80"
                  }`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {error && (
          <Text className="text-center text-[13px] text-[#EF4444]">{error}</Text>
        )}

        <Button
          onPress={() => submitMutation.mutate()}
          loading={submitMutation.isPending}
          fullWidth
          size="lg"
        >
          Creează evenimentul
        </Button>
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={eventDate}
          mode="date"
          minimumDate={new Date()}
          onChange={(e, d) => {
            setShowDatePicker(Platform.OS === "ios" && e.type !== "set");
            if (d) setEventDate(d);
          }}
        />
      )}
    </View>
  );
}
