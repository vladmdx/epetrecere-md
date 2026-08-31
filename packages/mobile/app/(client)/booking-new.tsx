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
  // The partner calls this number back, so a placeholder is worse than an
  // empty field: "+37300000000" is 11 non-uniform digits, which sails through
  // the server's sanity check and reaches the partner looking real.
  const clerkPhone = user?.phoneNumbers?.[0]?.phoneNumber ?? "";
  const [phone, setPhone] = useState(clerkPhone);
  const phoneOk = phone.replace(/\D/g, "").length >= 8;

  const [guestCount, setGuestCount] = useState("100");
  const [message, setMessage] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Absent fields are omitted, never sent as null. The server declares
      // them `.optional()` without `.nullable()`, so an explicit null fails
      // validation — which is why every booking sent from the app came back
      // 400. One of artistId/venueId is always unset, so this alone was fatal.
      const body = BookingRequestCreateSchema.parse({
        ...(artistId !== null ? { artistId } : {}),
        ...(venueId !== null ? { venueId } : {}),
        clientName:
          `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
          "Client",
        clientPhone: phone.trim(),
        ...(user?.primaryEmailAddress?.emailAddress
          ? { clientEmail: user.primaryEmailAddress.emailAddress }
          : {}),
        eventDate: eventDate.toISOString().slice(0, 10),
        startTime: `${String(startTime.getHours()).padStart(2, "0")}:${String(startTime.getMinutes()).padStart(2, "0")}`,
        eventType,
        ...(Number(guestCount) ? { guestCount: Number(guestCount) } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
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
              Trimite cerere
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

        {/* Time */}
        <Pressable onPress={() => setShowTimePicker(true)}>
          <Card className="flex-row items-center gap-3">
            <Clock size={20} color={colors.gold} />
            <View className="flex-1">
              <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Ora de început
              </Text>
              <Text className="mt-0.5 text-[15px] font-semibold text-foreground">
                {String(startTime.getHours()).padStart(2, "0")}:
                {String(startTime.getMinutes()).padStart(2, "0")}
              </Text>
            </View>
          </Card>
        </Pressable>

        {/* Phone — the number the partner will call back on. Prefilled from the
            account when there is one, asked for when there is not, because the
            alternative was inventing one. */}
        <View>
          <Input
            label="Telefon de contact"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            hint={
              clerkPhone
                ? "Din contul tău. Poți schimba numărul pentru această cerere."
                : "Artistul te sună pe acest număr."
            }
          />
        </View>

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
          <Text className="text-center text-[13px] text-[#EF4444]">{error}</Text>
        )}

        <Button
          onPress={() => submitMutation.mutate()}
          loading={submitMutation.isPending}
          disabled={!phoneOk}
          fullWidth
          size="lg"
        >
          Trimite cererea
        </Button>
        {!phoneOk && (
          <Text className="text-center text-[12px] text-muted-foreground">
            Adaugă un număr de telefon ca artistul să te poată contacta.
          </Text>
        )}

        <Text className="text-center text-[11px] leading-4 text-muted-foreground">
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
