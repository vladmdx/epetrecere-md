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

import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  Euro,
  MessageCircle,
  CheckCircle,
  ArrowLeftRight,
} from "lucide-react-native";
import { Card, Button, Badge, Avatar } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
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
  conversationId?: number | null;
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

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(API_PATHS.bookingRequest(bookingId), {
        status: "confirmed_by_client",
      });
      if (!res.ok) throw new Error(res.error?.message ?? "confirm_failed");
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["booking", bookingId] });
      void qc.invalidateQueries({ queryKey: ["my", "bookings"] });
    },
  });

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-background"
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const b = detailQuery.data;
  const vendorName = b.artistName ?? b.venueName ?? "Furnizor";
  const isTerminal = ["rejected", "cancelled", "expired", "completed"].includes(
    b.status,
  );

  return (
    <View className="flex-1 bg-background" style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]}>
        <View
          className="flex-row items-center gap-3 border-b border-border px-3 py-2"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
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
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text
            className="font-heading text-[18px] font-bold text-foreground"
            style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}
          >
            Detaliu cerere
          </Text>
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
          style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <Avatar
            uri={b.artistPhotoUrl ?? null}
            name={vendorName}
            sizeClass="h-14 w-14"
          />
          <View className="flex-1" style={{ flex: 1 }}>
            <Text
              className="text-[15px] font-semibold text-foreground"
              style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}
            >
              {vendorName}
            </Text>
            <Text
              className="text-[12px] text-muted-foreground"
              style={{ fontSize: 12, color: colors.mutedForeground }}
            >
              {b.artistId ? "Artist" : "Sală"}
            </Text>
          </View>
          <Badge tone={statusToTone(b.status)} size="sm">
            {statusLabel(b.status)}
          </Badge>
        </Card>

        {/* Status timeline */}
        {!isTerminal && (
          <Card className="gap-3" style={{ gap: 12 }}>
            <Text
              className="font-heading text-[14px] font-bold text-foreground"
              style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}
            >
              Progresul rezervării
            </Text>
            <Timeline status={b.status} />
          </Card>
        )}

        {/* Event details */}
        <Card className="gap-3" style={{ gap: 12 }}>
          <Text
            className="font-heading text-[14px] font-bold text-foreground"
            style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}
          >
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
          <Card className="gap-2" style={{ gap: 8 }}>
            <Text
              className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
              style={{
                fontSize: 11,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 2,
                color: colors.mutedForeground,
              }}
            >
              Mesajul tău
            </Text>
            <Text
              className="text-[14px] leading-5 text-foreground/85"
              style={{ fontSize: 14, lineHeight: 20, color: "rgba(247,245,238,0.85)" }}
            >
              {b.message}
            </Text>
          </Card>
        )}

        {/* Artist reply */}
        {b.artistReply && (
          <Card
            className="gap-2 border-gold/20 bg-gold/5"
            style={{
              gap: 8,
              borderColor: "rgba(201,168,76,0.2)",
              backgroundColor: "rgba(201,168,76,0.05)",
            }}
          >
            <Text
              className="text-[11px] font-semibold uppercase tracking-widest text-gold"
              style={{
                fontSize: 11,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 2,
                color: colors.gold,
              }}
            >
              Răspuns {vendorName}
            </Text>
            <Text
              className="text-[14px] leading-5 text-foreground"
              style={{ fontSize: 14, lineHeight: 20, color: colors.foreground }}
            >
              {b.artistReply}
            </Text>
          </Card>
        )}

        {/* Price offers */}
        {b.priceOffers && b.priceOffers.length > 0 && (
          <Card className="gap-3" style={{ gap: 12 }}>
            <Text
              className="font-heading text-[14px] font-bold text-foreground"
              style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}
            >
              Istoric negociere
            </Text>
            {b.priceOffers.map((offer, i) => (
              <View
                key={i}
                className="flex-row items-center justify-between"
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View className="flex-row items-center gap-2" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ArrowLeftRight
                    size={14}
                    color={
                      offer.from === "client" ? colors.gold : colors.info
                    }
                  />
                  <Text
                    className="text-[13px] text-foreground"
                    style={{ fontSize: 13, color: colors.foreground }}
                  >
                    {offer.from === "client" ? "Tu" : vendorName}
                  </Text>
                </View>
                <View className="flex-row items-center gap-3" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text
                    className="text-[14px] font-semibold text-foreground"
                    style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
                  >
                    {offer.amount} €
                  </Text>
                  <Text
                    className="text-[11px] text-muted-foreground"
                    style={{ fontSize: 11, color: colors.mutedForeground }}
                  >
                    {relativeTimeRO(offer.at)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Actions */}
        {b.status === "accepted" && (
          <View className="gap-2" style={{ gap: 8 }}>
            <Button
              onPress={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              fullWidth
              size="lg"
              leftIcon={<CheckCircle size={18} color={colors.background} />}
            >
              Confirmă rezervarea
            </Button>
            <Button
              variant="outline"
              onPress={() => {
                // Counter-offer modal ships in M3.7.
              }}
              fullWidth
              size="md"
              leftIcon={<ArrowLeftRight size={16} color={colors.gold} />}
            >
              Contrapropune preț
            </Button>
          </View>
        )}

        {b.conversationId != null && (
          <Button
            variant="outline"
            onPress={() => router.push(`/(client)/chat/${b.conversationId}`)}
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
  const isGoldValue = valueClass?.includes("text-gold") ?? false;
  const isSemiboldValue = valueClass?.includes("font-semibold") ?? false;
  return (
    <View
      className="flex-row items-center gap-3"
      style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <Icon size={16} color={colors.mutedForeground} />
      <Text
        className="flex-1 text-[13px] text-muted-foreground"
        style={{ flex: 1, fontSize: 13, color: colors.mutedForeground }}
      >
        {label}
      </Text>
      <Text
        className={`text-[14px] text-foreground ${valueClass ?? ""}`}
        style={{
          fontSize: 14,
          color: isGoldValue ? colors.gold : colors.foreground,
          fontWeight: isSemiboldValue ? "600" : undefined,
        }}
      >
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
    <View className="flex-row items-center" style={{ flexDirection: "row", alignItems: "center" }}>
      {STATUS_TIMELINE.map((step, i) => {
        const reached = i <= currentIndex;
        const isLast = i === STATUS_TIMELINE.length - 1;
        return (
          <View
            key={step.key}
            className="flex-row items-center"
            style={[{ flexDirection: "row", alignItems: "center" }, { flex: isLast ? 0 : 1 }]}
          >
            <View className="items-center gap-1" style={{ alignItems: "center", gap: 4 }}>
              <View
                className={`h-6 w-6 items-center justify-center rounded-full ${
                  reached
                    ? "bg-gold"
                    : "border-2 border-border bg-card"
                }`}
                style={{
                  height: 24,
                  width: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 9999,
                  backgroundColor: reached ? colors.gold : colors.card,
                  ...(reached ? {} : { borderWidth: 2, borderColor: colors.border }),
                }}
              >
                {reached && <CheckCircle size={14} color={colors.background} />}
              </View>
              <Text
                className={`text-[10px] ${reached ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                style={{
                  fontSize: 10,
                  color: reached ? colors.foreground : colors.mutedForeground,
                  fontWeight: reached ? "600" : undefined,
                }}
              >
                {step.label}
              </Text>
            </View>
            {!isLast && (
              <View
                className={`mx-1 h-px flex-1 ${reached ? "bg-gold" : "bg-border"}`}
                style={[
                  {
                    marginHorizontal: 4,
                    height: 1,
                    flex: 1,
                    backgroundColor: reached ? colors.gold : colors.border,
                  },
                  { marginTop: -14 },
                ]}
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

