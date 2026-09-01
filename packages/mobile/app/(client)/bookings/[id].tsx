// Booking detail.
//
// Sections:
//   1. Vendor card with name + photo + slug-link to detail
//   2. Status timeline — visual breadcrumb (Trimisă → Confirmare →
//      Confirmat → Finalizat)
//   3. Event details (date, time, location, guest count, type)
//   4. Price negotiation history (priceOffers[])
//   5. Action row: "Confirmă" / "Contrapropune" / "Anulează" depending
//      on status
//   6. "Deschide chatul" CTA at the bottom — links to /chat/<convId>

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  Euro,
  MessageCircle,
  CheckCircle,
  ArrowLeftRight,
} from "lucide-react-native";
import { Card, Button, Badge, Avatar, ErrorState } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi, unwrap } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import {
  eventTypeLabel,
  formatDateRO,
  relativeTimeRO,
} from "@epetrecere/shared/utils";

interface BookingDetail {
  id: number;
  artistId: number | null;
  venueId: number | null;
  artistName: string | null;
  artistSlug: string | null;
  artistPhotoUrl?: string | null;
  venueName: string | null;
  venueSlug: string | null;
  status: string;
  agreedPrice: number | null;
  priceOffers: Array<{
    from: "artist" | "client";
    amount: number;
    message?: string;
    at: string;
  }>;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  guestCount: number | null;
  message: string | null;
  artistReply: string | null;
}

const STATUS_TIMELINE = [
  { key: "pending", label: "Trimisă" },
  { key: "accepted", label: "Confirmare" },
  { key: "confirmed_by_client", label: "Confirmat" },
  { key: "completed", label: "Finalizat" },
];

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Number(id);
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["booking", bookingId],
    enabled: Number.isFinite(bookingId),
    queryFn: async () => {
      const list = await api.get<BookingDetail[]>(API_PATHS.bookingRequests, {
        query: { id: bookingId },
      });
      // The /booking-requests endpoint returns an array; we filter to ours.
      const arr = Array.isArray(list.data) ? list.data : [];
      return arr.find((b) => b.id === bookingId) ?? null;
    },
  });

  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [counterError, setCounterError] = useState<string | null>(null);

  /**
   * The client's half of the negotiation.
   *
   * The button for this existed with an empty handler and the comment
   * "Counter-offer modal ships in M3.7" — and it was rendered only when the
   * booking was already accepted, which is after negotiation is over. So a
   * partner could send a price and the client could read it and do nothing:
   * the partner's own sheet promises "clientul vede oferta ta și poate
   * accepta, refuza sau veni cu o altă propunere", and none of those were
   * possible from the app.
   *
   * The server has always supported it — its handler says in as many words
   * that either party can push a counter-offer — so this is only the missing
   * screen.
   */
  const counterMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await api.put(API_PATHS.bookingRequest(bookingId), {
        action: "propose_price",
        agreedPrice: amount,
        message: counterNote.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error?.message ?? "counter_failed");
      return res.data;
    },
    onSuccess: () => {
      // The same keys the screen and the confirm mutation already use. Named
      // by hand the first time and named wrongly, so the offer landed on the
      // server and the history below it did not move.
      void qc.invalidateQueries({ queryKey: ["booking", bookingId] });
      void qc.invalidateQueries({ queryKey: ["my", "bookings"] });
      setCounterOpen(false);
      setCounterAmount("");
      setCounterNote("");
      setCounterError(null);
    },
    onError: (err) => {
      setCounterError(err instanceof Error ? err.message : "A apărut o eroare");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      // The PUT /booking-requests/[id] handler is an ACTION dispatcher keyed
      // on body.action (accept / reject / client_confirm / …). Sending
      // `status` would hit the "Unknown action" branch → 400. The client
      // promotes an "accepted" booking via action="client_confirm".
      const res = await api.put(API_PATHS.bookingRequest(bookingId), {
        action: "client_confirm",
      });
      if (!res.ok) throw new Error(res.error?.message ?? "confirm_failed");
      return unwrap(res);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["booking", bookingId] });
      void qc.invalidateQueries({ queryKey: ["my", "bookings"] });
    },
  });

  // The booking-requests GET never returns a conversationId, so we can't gate
  // the chat CTA on it. Instead find-or-create the conversation for this
  // booking's vendor on press (POST /conversations { artistId | venueId }
  // returns { id }) and navigate to the returned thread.
  const openChatMutation = useMutation({
    mutationFn: async (vars: { artistId?: number; venueId?: number }) => {
      const res = await api.post<{ id: number; created: boolean }>(
        API_PATHS.conversations,
        vars,
      );
      if (!res.ok || !res.data) {
        throw new Error(res.error?.message ?? "conversation_failed");
      }
      return unwrap(res);
    },
    onSuccess: (data) => {
      router.push(`/(client)/chat/${data.id}`);
    },
  });

  if (detailQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  // A failed read used to land here too, and this guard never reopened —
  // the query resolved with data:null, so isLoading went false while the
  // condition stayed true. Now failure has its own branch and a way out.
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <ErrorState
        error={detailQuery.error}
        onRetry={() => detailQuery.refetch()}
        retrying={detailQuery.isFetching}
      />
    );
  }

  const b = detailQuery.data;
  const vendorName = b.artistName ?? b.venueName ?? "Furnizor";
  const isTerminal = ["rejected", "cancelled", "expired", "completed"].includes(
    b.status,
  );

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]}>
        <View className="flex-row items-center gap-3 border-b border-border px-3 py-2">
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text className="font-heading text-[18px] font-bold text-foreground">
            Detaliu cerere
          </Text>
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
      >
        {/* Vendor card */}
        <Card
          onPress={() => {
            if (b.artistSlug)
              router.push(`/(client)/artist/${b.artistSlug}`);
            else if (b.venueSlug)
              router.push(`/(client)/venue/${b.venueSlug}`);
          }}
          className="flex-row items-center gap-3"
        >
          <Avatar
            uri={b.artistPhotoUrl ?? null}
            name={vendorName}
            sizeClass="h-14 w-14"
          />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-foreground">
              {vendorName}
            </Text>
            <Text className="text-[12px] text-muted-foreground">
              {b.artistId ? "Artist" : "Sală"}
            </Text>
          </View>
          <Badge tone={statusToTone(b.status)} size="sm">
            {statusLabel(b.status)}
          </Badge>
        </Card>

        {/* Status timeline */}
        {!isTerminal && (
          <Card className="gap-3">
            <Text className="font-heading text-[14px] font-bold text-foreground">
              Progresul rezervării
            </Text>
            <Timeline status={b.status} />
          </Card>
        )}

        {/* Event details */}
        <Card className="gap-3">
          <Text className="font-heading text-[14px] font-bold text-foreground">
            Detalii eveniment
          </Text>
          <DetailLine
            Icon={Calendar}
            label="Data"
            value={formatDateRO(b.eventDate)}
          />
          {b.startTime && (
            <DetailLine
              Icon={Clock}
              label="Ora"
              value={`${b.startTime}${b.endTime ? ` – ${b.endTime}` : ""}`}
            />
          )}
          {b.eventType && (
            <DetailLine
              Icon={Calendar}
              label="Tip"
              value={eventTypeLabel(b.eventType)}
            />
          )}
          {b.guestCount != null && (
            <DetailLine
              Icon={Users}
              label="Invitați"
              value={String(b.guestCount)}
            />
          )}
          {b.agreedPrice != null && (
            <DetailLine
              Icon={Euro}
              label="Preț agreat"
              value={`${b.agreedPrice} €`}
              valueClass="text-gold font-semibold"
            />
          )}
        </Card>

        {/* Your message */}
        {b.message && (
          <Card className="gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Mesajul tău
            </Text>
            <Text className="text-[14px] leading-5 text-foreground/85">
              {b.message}
            </Text>
          </Card>
        )}

        {/* Artist reply */}
        {b.artistReply && (
          <Card className="gap-2 border-gold/20 bg-gold/5">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-gold">
              Răspuns {vendorName}
            </Text>
            <Text className="text-[14px] leading-5 text-foreground">
              {b.artistReply}
            </Text>
          </Card>
        )}

        {/* Price offers */}
        {b.priceOffers && b.priceOffers.length > 0 && (
          <Card className="gap-3">
            <Text className="font-heading text-[14px] font-bold text-foreground">
              Istoric negociere
            </Text>
            {b.priceOffers.map((offer, i) => (
              <View key={i} className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <ArrowLeftRight
                    size={14}
                    color={
                      offer.from === "client" ? colors.gold : colors.info
                    }
                  />
                  <Text className="text-[13px] text-foreground">
                    {offer.from === "client" ? "Tu" : vendorName}
                  </Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <Text className="text-[14px] font-semibold text-foreground">
                    {offer.amount} €
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {relativeTimeRO(offer.at)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Actions */}
        {b.status === "accepted" && (
          <View className="gap-2">
            <Button
              onPress={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              fullWidth
              size="lg"
              leftIcon={<CheckCircle size={18} color={colors.background} />}
            >
              Confirmă rezervarea
            </Button>
          </View>
        )}

        {/* Negotiation is only open while the request is pending — the same
            window the server enforces. */}
        {b.status === "pending" && (
          <Button
            variant="outline"
            onPress={() => setCounterOpen(true)}
            fullWidth
            size="md"
            leftIcon={<ArrowLeftRight size={16} color={colors.gold} />}
          >
            Propune alt preț
          </Button>
        )}

        <Modal
          visible={counterOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setCounterOpen(false)}
        >
          <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, gap: 14 }}>
            <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "700" }}>
              Propune alt preț
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13.5, lineHeight: 20 }}>
              Cererea rămâne deschisă. Artistul vede propunerea ta și poate
              accepta sau răspunde cu alta.
            </Text>
            <TextInput
              value={counterAmount}
              onChangeText={(v) => setCounterAmount(v.replace(/[^0-9]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="Suma propusă (€)"
              placeholderTextColor={colors.mutedForeground}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 14,
                color: colors.foreground,
                fontSize: 16,
              }}
            />
            <TextInput
              value={counterNote}
              onChangeText={setCounterNote}
              placeholder="Notă pentru artist (opțional)"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 14,
                minHeight: 90,
                color: colors.foreground,
                fontSize: 15,
                textAlignVertical: "top",
              }}
            />
            {counterError && (
              <Text style={{ color: colors.danger, fontSize: 13.5, lineHeight: 19 }}>
                {counterError}
              </Text>
            )}
            <Button
              onPress={() => counterMutation.mutate(Number(counterAmount))}
              disabled={!Number(counterAmount)}
              loading={counterMutation.isPending}
              fullWidth
              size="lg"
            >
              Trimite propunerea
            </Button>
            <Button variant="outline" onPress={() => setCounterOpen(false)} fullWidth size="md">
              Renunț
            </Button>
          </View>
        </Modal>

        {(b.artistId != null || b.venueId != null) && (
          <Button
            variant="outline"
            onPress={() =>
              openChatMutation.mutate(
                b.artistId != null
                  ? { artistId: b.artistId }
                  : { venueId: b.venueId! },
              )
            }
            loading={openChatMutation.isPending}
            fullWidth
            size="md"
            leftIcon={<MessageCircle size={16} color={colors.gold} />}
          >
            Deschide conversația
          </Button>
        )}
      </ScrollView>
    </View>
  );
}

function DetailLine({
  Icon,
  label,
  value,
  valueClass,
}: {
  Icon: typeof Calendar;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Icon size={16} color={colors.mutedForeground} />
      <Text className="flex-1 text-[13px] text-muted-foreground">{label}</Text>
      <Text className={`text-[14px] text-foreground ${valueClass ?? ""}`}>
        {value}
      </Text>
    </View>
  );
}

function Timeline({ status }: { status: string }) {
  const currentIndex = STATUS_TIMELINE.findIndex((s) => s.key === status);
  // Final state (completed) is the last item; for accepted/confirmed_by_client
  // findIndex returns the correct cursor.
  return (
    <View className="flex-row items-center">
      {STATUS_TIMELINE.map((step, i) => {
        const reached = i <= currentIndex;
        const isLast = i === STATUS_TIMELINE.length - 1;
        return (
          <View key={step.key} className="flex-row items-center" style={{ flex: isLast ? 0 : 1 }}>
            <View className="items-center gap-1">
              <View
                className={`h-6 w-6 items-center justify-center rounded-full ${
                  reached
                    ? "bg-gold"
                    : "border-2 border-border bg-card"
                }`}
              >
                {reached && <CheckCircle size={14} color={colors.background} />}
              </View>
              <Text
                className={`text-[10px] ${reached ? "text-foreground font-semibold" : "text-muted-foreground"}`}
              >
                {step.label}
              </Text>
            </View>
            {!isLast && (
              <View
                className={`mx-1 h-px flex-1 ${reached ? "bg-gold" : "bg-border"}`}
                style={{ marginTop: -14 }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function statusLabel(status: string): string {
  return (
    {
      pending: "Trimisă",
      accepted: "Confirmare",
      confirmed_by_client: "Confirmat",
      completed: "Finalizat",
      rejected: "Refuzat",
      cancelled: "Anulat",
      expired: "Expirat",
    }[status] ?? status
  );
}

function statusToTone(
  status: string,
): "indigo" | "warning" | "success" | "danger" | "default" {
  switch (status) {
    case "pending":
      return "indigo";
    case "accepted":
      return "warning";
    case "confirmed_by_client":
    case "completed":
      return "success";
    case "rejected":
    case "cancelled":
      return "danger";
    default:
      return "default";
  }
}

