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
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, Calendar, Users, Wallet, Building2, MapPin } from "lucide-react-native";
import { Button, Input, Card, CalendarPicker } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared";
import { eventTypeLabel, formatDateRO } from "@epetrecere/shared/utils";
import { toLocalYMD } from "../../../lib/dates";

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
  const [location, setLocation] = useState("Chișinău");
  const [guestCount, setGuestCount] = useState("");
  const [budget, setBudget] = useState("");
  const [venueNeeded, setVenueNeeded] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get<{ id: number; nameRo: string }[]>(
        API_PATHS.categories,
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const toggleCategory = (id: number) =>
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

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
          eventDate: toLocalYMD(eventDate),
          location: location.trim() || undefined,
          guestCountTarget:
            guestCount && guests > 0 ? guests : undefined,
          budgetTarget: budget && budgetVal >= 0 ? budgetVal : undefined,
          venueNeeded,
          selectedCategories:
            selectedCategories.length > 0 ? selectedCategories : undefined,
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
    <View className="flex-1 bg-background" style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]}>
        <View
          className="flex-row items-center justify-between border-b border-border px-3 py-2"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
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
              style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}
            >
              Eveniment nou
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        style={{ flex: 1 }}
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
          <Text
            className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground"
            style={{
              marginBottom: 8,
              fontSize: 12,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 2,
              color: colors.mutedForeground,
            }}
          >
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
                style={{
                  borderRadius: 9999,
                  borderWidth: 1,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderColor: eventType === t ? colors.gold : colors.border,
                  backgroundColor:
                    eventType === t ? "rgba(201,168,76,0.15)" : colors.card,
                }}
              >
                <Text
                  className={`text-[13px] font-semibold ${
                    eventType === t ? "text-gold" : "text-foreground/80"
                  }`}
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color:
                      eventType === t ? colors.gold : "rgba(247,245,238,0.8)",
                  }}
                >
                  {eventTypeLabel(t)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Date */}
        <Pressable onPress={() => setShowDatePicker(true)}>
          <Card
            className="flex-row items-center gap-3"
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Calendar size={20} color={colors.gold} />
            <View className="flex-1" style={{ flex: 1 }}>
              <Text
                className="text-[11px] uppercase tracking-widest text-muted-foreground"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  color: colors.mutedForeground,
                }}
              >
                Data evenimentului
              </Text>
              <Text
                className="mt-0.5 text-[15px] font-semibold text-foreground"
                style={{
                  marginTop: 2,
                  fontSize: 15,
                  fontWeight: "600",
                  color: colors.foreground,
                }}
              >
                {formatDateRO(toLocalYMD(eventDate))}
              </Text>
            </View>
          </Card>
        </Pressable>

        {/* Location */}
        <Input
          label="Oraș"
          value={location}
          onChangeText={setLocation}
          autoCapitalize="words"
          rightSlot={<MapPin size={18} color={colors.mutedForeground} />}
        />

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
          <Text
            className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground"
            style={{
              marginBottom: 8,
              fontSize: 12,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 2,
              color: colors.mutedForeground,
            }}
          >
            Ai nevoie de sală?
          </Text>
          <View className="flex-row gap-8" style={{ flexDirection: "row", gap: 32 }}>
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
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 16,
                  borderWidth: 1,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderColor: venueNeeded === opt.value ? colors.gold : colors.border,
                  backgroundColor:
                    venueNeeded === opt.value ? "rgba(201,168,76,0.15)" : colors.card,
                }}
              >
                <Building2
                  size={16}
                  color={venueNeeded === opt.value ? colors.gold : colors.mutedForeground}
                />
                <Text
                  className={`text-[13px] font-semibold ${
                    venueNeeded === opt.value ? "text-gold" : "text-foreground/80"
                  }`}
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color:
                      venueNeeded === opt.value ? colors.gold : "rgba(247,245,238,0.8)",
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Services / artist categories */}
        <View>
          <Text
            style={{
              marginBottom: 8,
              fontSize: 12,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 2,
              color: colors.mutedForeground,
            }}
          >
            Ce artiști / servicii cauți? (opțional)
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(categoriesQuery.data ?? []).map((c) => {
              const selected = selectedCategories.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => toggleCategory(c.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: selected ? colors.gold : colors.border,
                    backgroundColor: selected
                      ? "rgba(201,168,76,0.15)"
                      : colors.card,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: selected ? colors.gold : "rgba(247,245,238,0.8)",
                    }}
                  >
                    {c.nameRo}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error && (
          <Text
            className="text-center text-[13px] text-[#EF4444]"
            style={{ textAlign: "center", fontSize: 13, color: colors.danger }}
          >
            {error}
          </Text>
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

      <CalendarPicker
        visible={showDatePicker}
        value={eventDate}
        minDate={new Date()}
        onChange={setEventDate}
        onClose={() => setShowDatePicker(false)}
        title="Data evenimentului"
      />
    </View>
  );
}
