// Create event plan — the screen the cabinet/home "Plănuiește un
// eveniment" CTA links to. Collects the essentials, POSTs to
// /api/v1/event-plans, and lands the user on their fresh plan.
//
// Previously this route DID NOT EXIST, so the planning CTA crashed with
// "Unmatched Route". This is the minimal-but-real create flow; the full
// 7-step wizard (guests, checklist, budget breakdown) layers on top of
// the plan detail screen once the plan exists.

import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react-native";
import { SafeScreen, Input, Button } from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

const EVENT_TYPES: { value: string; label: string }[] = [
  { value: "wedding", label: "Nuntă" },
  { value: "cumatrie", label: "Cumătrie" },
  { value: "baptism", label: "Botez" },
  { value: "birthday", label: "Zi de naștere" },
  { value: "corporate", label: "Corporativ" },
  { value: "concert", label: "Concert" },
  { value: "other", label: "Altul" },
];

export default function PlanningScreen() {
  const router = useRouter();
  const api = useApi();

  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [guests, setGuests] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createPlan = useMutation({
    mutationFn: async () => {
      const guestCount = guests.trim() ? parseInt(guests, 10) : null;
      const res = await api.post<{ id?: number; plan?: { id: number } }>(
        API_PATHS.eventPlans,
        {
          title: title.trim(),
          eventType,
          eventDate: eventDate.trim() || null,
          location: location.trim() || null,
          guestCountTarget:
            guestCount && guestCount > 0 ? guestCount : null,
          venueNeeded: true,
          checklistEnabled: true,
          budgetEnabled: true,
          guestsEnabled: true,
          momentsEnabled: true,
        },
      );
      if (!res.ok) {
        throw new Error(res.error?.message ?? "Nu s-a putut crea planul.");
      }
      return res.data?.plan?.id ?? res.data?.id ?? null;
    },
    onSuccess: (id) => {
      if (id) router.replace(`/(client)/plan/${id}`);
      else router.replace("/(client)/(tabs)/cabinet");
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "A apărut o eroare.");
    },
  });

  function handleSubmit() {
    setError(null);
    if (title.trim().length < 2) {
      setError("Dă un nume evenimentului (minim 2 caractere).");
      return;
    }
    if (eventDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim())) {
      setError("Data trebuie în format AAAA-LL-ZZ (ex. 2026-08-15).");
      return;
    }
    createPlan.mutate();
  }

  return (
    <SafeScreen padded scroll>
      <View className="gap-1 pt-2">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-gold/15">
          <Sparkles size={24} color={colors.gold} />
        </View>
        <Text className="mt-2 font-heading text-[26px] font-bold text-foreground">
          Plănuiește un eveniment
        </Text>
        <Text className="text-[13px] text-muted-foreground">
          Completează detaliile de bază — îți pregătim panoul cu checklist,
          buget și invitați.
        </Text>
      </View>

      <View className="mt-6">
        <Input
          label="Numele evenimentului"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        <Text className="mb-2 mt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Tip eveniment
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {EVENT_TYPES.map((et) => {
            const active = eventType === et.value;
            return (
              <Pressable
                key={et.value}
                onPress={() => setEventType(active ? null : et.value)}
                className={`rounded-full border px-4 py-2 ${
                  active ? "border-gold bg-gold/15" : "border-border bg-card"
                }`}
              >
                <Text
                  className={`text-[13px] font-medium ${
                    active ? "text-gold" : "text-foreground"
                  }`}
                >
                  {et.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-5">
          <Input
            label="Data (AAAA-LL-ZZ)"
            value={eventDate}
            onChangeText={setEventDate}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            hint="Opțional — ex. 2026-08-15"
          />
          <Input
            label="Localitate / sală"
            value={location}
            onChangeText={setLocation}
            hint="Opțional"
          />
          <Input
            label="Număr invitați"
            value={guests}
            onChangeText={setGuests}
            keyboardType="number-pad"
            hint="Opțional"
          />
        </View>

        {error && (
          <Text className="mb-2 text-[13px] text-[#EF4444]">{error}</Text>
        )}

        <Button
          onPress={handleSubmit}
          loading={createPlan.isPending}
          fullWidth
          size="lg"
          style={{ marginTop: 8 }}
          leftIcon={<Sparkles size={18} color={colors.background} />}
        >
          Creează planul
        </Button>
      </View>
    </SafeScreen>
  );
}
