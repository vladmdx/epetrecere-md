// Partner booking detail.
//
// Same skeleton as the client-side booking detail but with partner
// actions: Acceptă / Propune preț / Refuză on pending, Finalizat on
// confirmed_by_client, plus access to the chat.

import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
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
  XCircle,
  ArrowLeftRight,
  Phone,
  Mail,
} from "lucide-react-native";
import { Card, Button, Badge } from "../../../../components/ui";
import { colors } from "../../../../constants/theme";
import { useApi } from "../../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import {
  eventTypeLabel,
  formatDateRO,
  relativeTimeRO,
} from "@epetrecere/shared/utils";

interface BookingDetail {
  id: number;
  status: string;
  artistId: number | null;
  venueId: number | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  guestCount: number | null;
  message: string | null;
  artistReply: string | null;
  agreedPrice: number | null;
  priceOffers: Array<{
    from: "artist" | "client";
    amount: number;
    message?: string;
    at: string;
  }>;
}

export default function PartnerBookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Number(id);
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["partner-booking", bookingId],
    enabled: Number.isFinite(bookingId),
    queryFn: async () => {
      const res = await api.get<BookingDetail[]>(API_PATHS.bookingRequests, {
        query: { id: bookingId },
      });
      const arr = Array.isArray(res.data) ? res.data : [];
      return arr.find((b) => b.id === bookingId) ?? null;
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(API_PATHS.bookingRequest(bookingId), {
        action: "complete",
      });
      if (!res.ok) throw new Error(res.error?.message ?? "finalize_failed");
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["partner-booking", bookingId] });
      void qc.invalidateQueries({ queryKey: ["partner-bookings"] });
    },
  });

  // The booking GET never returns a conversationId, so we find-or-create the
  // conversation on press: POST /conversations with the booking's artistId or
  // venueId returns { id }, which is the chat thread to open.
  const openChatMutation = useMutation({
    mutationFn: async () => {
      const booking = detailQuery.data;
      if (!booking) throw new Error("no_booking");
      const target =
        booking.artistId != null
          ? { artistId: booking.artistId }
          : booking.venueId != null
            ? { venueId: booking.venueId }
            : null;
      if (!target) throw new Error("no_vendor");
      const res = await api.post<{ id: number; created: boolean }>(
        API_PATHS.conversations,
        target,
      );
      if (!res.ok || !res.data) {
        throw new Error(res.error?.message ?? "open_chat_failed");
      }
      return res.data.id;
    },
    onSuccess: (conversationId) => {
      router.push(`/(client)/chat/${conversationId}`);
    },
  });

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const b = detailQuery.data;

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]}>
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text className="font-heading text-[18px] font-bold text-foreground">
            Cerere detaliu
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 32,
          gap: 16,
        }}
      >
        {/* Client card */}
        <Card className="gap-3">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="font-heading text-[20px] font-bold text-foreground">
                {b.clientName}
              </Text>
              <Text className="text-[12px] text-muted-foreground">
                {eventTypeLabel(b.eventType)}
              </Text>
            </View>
            <Badge tone={statusToTone(b.status)} size="md">
              {statusLabel(b.status)}
            </Badge>
          </View>
          {/* Show contact when accepted+ */}
          {(b.status === "accepted" ||
            b.status === "confirmed_by_client" ||
            b.status === "completed") && (
            <View className="gap-1">
              <ContactRow Icon={Phone} value={b.clientPhone} />
              {b.clientEmail && <ContactRow Icon={Mail} value={b.clientEmail} />}
            </View>
          )}
        </Card>

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

        {/* Client message */}
        {b.message && (
          <Card className="gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Mesaj client
            </Text>
            <Text className="text-[14px] italic leading-5 text-foreground/85">
              „{b.message}”
            </Text>
          </Card>
        )}

        {/* Your reply */}
        {b.artistReply && (
          <Card className="gap-2 border-gold/20 bg-gold/5">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-gold">
              Răspunsul tău
            </Text>
            <Text className="text-[14px] leading-5 text-foreground">
              {b.artistReply}
            </Text>
          </Card>
        )}

        {/* Price offer history */}
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
                    color={offer.from === "artist" ? colors.gold : colors.info}
                  />
                  <Text className="text-[13px] text-foreground">
                    {offer.from === "artist" ? "Tu" : b.clientName}
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
        {b.status === "pending" && (
          <View className="gap-2">
            <Button
              onPress={() =>
                router.push(`/(partner)/booking/${bookingId}/accept` as never)
              }
              fullWidth
              size="lg"
              leftIcon={<CheckCircle size={18} color={colors.background} />}
            >
              Acceptă cererea
            </Button>
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                onPress={() =>
                  router.push(
                    `/(partner)/booking/${bookingId}/propose-price` as never,
                  )
                }
                size="md"
                leftIcon={<ArrowLeftRight size={16} color={colors.gold} />}
              >
                Propune preț
              </Button>
              <Button
                variant="ghost"
                onPress={() =>
                  router.push(`/(partner)/booking/${bookingId}/reject` as never)
                }
                size="md"
                leftIcon={<XCircle size={16} color={colors.danger} />}
              >
                Refuză
              </Button>
            </View>
          </View>
        )}

        {b.status === "confirmed_by_client" && (
          <Button
            onPress={() => finalizeMutation.mutate()}
            loading={finalizeMutation.isPending}
            fullWidth
            size="lg"
            leftIcon={<CheckCircle size={18} color={colors.background} />}
          >
            Marchează ca finalizat
          </Button>
        )}

        {(b.artistId != null || b.venueId != null) && (
          <Button
            variant="outline"
            onPress={() => openChatMutation.mutate()}
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

function ContactRow({
  Icon,
  value,
}: {
  Icon: typeof Phone;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon size={14} color={colors.mutedForeground} />
      <Text className="text-[13px] text-foreground">{value}</Text>
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

function statusLabel(status: string): string {
  return (
    {
      pending: "Nouă",
      accepted: "Acceptată",
      confirmed_by_client: "Confirmată",
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
