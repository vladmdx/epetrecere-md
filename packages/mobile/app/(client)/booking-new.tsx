// Create a new booking request from an artist or venue detail.
//
// Form fields:
//   - Tip eveniment (select)
//   - Data (DateTimePicker — native iOS/Android)
//   - Ora de început (DateTimePicker)
//   - Număr invitați
//   - Mesaj opțional
//
// Validates with the @epetrecere/shared Zod schema. On submit POST
// to /api/v1/booking-requests; success → push to booking detail with
// confetti animation; failure → inline error under the submit button.

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-expo";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { X, Calendar, Clock, Users } from "lucide-react-native";
import { Button, Input, Card } from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../lib/api";
import {
  API_PATHS,
  BookingRequestCreateSchema,
} from "@epetrecere/shared";
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

export default function BookingNewScreen() {
  const params = useLocalSearchParams<{
    artistId?: string;
    venueId?: string;
  }>();
  const router = useRouter();
  const { user } = useUser();
  const api = useApi();

  const artistId = params.artistId ? Number(params.artistId) : null;
  const venueId = params.venueId ? Number(params.venueId) : null;

  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]>("wedding");
  const [eventDate, setEventDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30); // default 30 days out
    return d;
  });
  const [startTime, setStartTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(17, 0, 0, 0);
    return d;
  });
  const [guestCount, setGuestCount] = useState("100");
  const [message, setMessage] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Send `undefined` (omitted by JSON) rather than `null` for optional
      // fields: the server's create schema uses `.optional()` (not
      // `.nullable()`), so a literal null fails validation with a 400 — which
      // otherwise breaks EVERY booking (venueId is null on the artist flow and
      // vice-versa, plus empty message/guestCount).
      const body = BookingRequestCreateSchema.parse({
        artistId: artistId ?? undefined,
        venueId: venueId ?? undefined,
        clientName:
          `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
          "Client",
        clientPhone: user?.phoneNumbers?.[0]?.phoneNumber ?? "+37300000000",
        clientEmail: user?.primaryEmailAddress?.emailAddress ?? undefined,
        eventDate: eventDate.toISOString().slice(0, 10),
        startTime: `${String(startTime.getHours()).padStart(2, "0")}:${String(startTime.getMinutes()).padStart(2, "0")}`,
        eventType,
        guestCount: Number(guestCount) || undefined,
        message: message.trim() || undefined,
      });
      const res = await api.post(API_PATHS.bookingRequests, body);
      if (!res.ok) throw new Error(res.error?.message ?? "submit_failed");
      return res.data as { id: number };
    },
    onSuccess: (data) => {
      router.replace(`/(client)/bookings/${data.id}`);
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
              style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999 }}
            >
              <X size={20} color={colors.foreground} />
            </Pressable>
            <Text
              className="font-heading text-[18px] font-bold text-foreground"
              style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}
            >
              Trimite cerere
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
                  backgroundColor: eventType === t ? "rgba(201,168,76,0.15)" : colors.card,
                }}
              >
                <Text
                  className={`text-[13px] font-semibold ${
                    eventType === t ? "text-gold" : "text-foreground/80"
                  }`}
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: eventType === t ? colors.gold : "rgba(247,245,238,0.8)",
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
                style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: colors.mutedForeground }}
              >
                Data evenimentului
              </Text>
              <Text
                className="mt-0.5 text-[15px] font-semibold text-foreground"
                style={{ marginTop: 2, fontSize: 15, fontWeight: "600", color: colors.foreground }}
              >
                {formatDateRO(eventDate.toISOString().slice(0, 10))}
              </Text>
            </View>
          </Card>
        </Pressable>

        {/* Time */}
        <Pressable onPress={() => setShowTimePicker(true)}>
          <Card
            className="flex-row items-center gap-3"
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Clock size={20} color={colors.gold} />
            <View className="flex-1" style={{ flex: 1 }}>
              <Text
                className="text-[11px] uppercase tracking-widest text-muted-foreground"
                style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: colors.mutedForeground }}
              >
                Ora de început
              </Text>
              <Text
                className="mt-0.5 text-[15px] font-semibold text-foreground"
                style={{ marginTop: 2, fontSize: 15, fontWeight: "600", color: colors.foreground }}
              >
                {String(startTime.getHours()).padStart(2, "0")}:
                {String(startTime.getMinutes()).padStart(2, "0")}
              </Text>
            </View>
          </Card>
        </Pressable>

        {/* Guest count */}
        <View>
          <Input
            label="Număr invitați"
            value={guestCount}
            onChangeText={(v) => setGuestCount(v.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            rightSlot={<Users size={18} color={colors.mutedForeground} />}
          />
        </View>

        {/* Message */}
        <View>
          <Input
            label="Mesaj (opțional)"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
            hint="Spune-i artistului ce vrei să discutați."
          />
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
          Trimite cererea
        </Button>

        <Text
          className="text-center text-[11px] leading-4 text-muted-foreground"
          style={{ textAlign: "center", fontSize: 11, lineHeight: 16, color: colors.mutedForeground }}
        >
          Continuând, accepți ca furnizorul să te contacteze cu privire la
          eveniment.
        </Text>
      </ScrollView>

      {/* Native date pickers */}
      {showDatePicker && (
        <DateTimePicker
          value={eventDate}
          mode="date"
          minimumDate={new Date()}
          onChange={(e, d) => {
            // On Android the picker closes on selection — set state on
            // the first event. On iOS it stays open inline so we keep
            // showing until the user explicitly confirms; here we close
            // for both to keep behavior consistent.
            setShowDatePicker(Platform.OS === "ios" && e.type !== "set");
            if (d) setEventDate(d);
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={startTime}
          mode="time"
          is24Hour
          onChange={(e, d) => {
            setShowTimePicker(Platform.OS === "ios" && e.type !== "set");
            if (d) setStartTime(d);
          }}
        />
      )}
    </View>
  );
}
