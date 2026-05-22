// Partner bookings inbox.
//
// Three tabs:
//   Active     pending requests waiting for the artist's reply
//   Acceptate  artist accepted but awaiting client confirmation
//   Trecute    completed / rejected / cancelled / expired
//
// Each row has inline action buttons specific to its state:
//   pending  Acceptă (modal) · Propune preț (modal) · Trimite mesaj · Refuză (modal)
//   accepted Trimite mesaj · Reaminteşte · Anulează
//   confirmed_by_client Finalizat · Anulează
//
// All mutations go through PUT /api/v1/booking-requests/[id] which
// the unversioned route exports. The accept/reject/propose modals
// live in app/(partner)/booking/[id]/* as routes so partners can
// deep-link from a push notification straight to "Acceptă cererea".

import { useMemo, useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import {
  CheckCircle,
  XCircle,
  ArrowLeftRight,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react-native";
import {
  SafeScreen,
  Card,
  Button,
  Badge,
  type BadgeTone,
} from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import {
  formatDateShortRO,
  eventTypeLabel,
  relativeTimeRO,
} from "@epetrecere/shared/utils";

interface BookingRequest {
  id: number;
  artistId: number | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  guestCount: number | null;
  message: string | null;
  status:
    | "pending"
    | "accepted"
    | "confirmed_by_client"
    | "rejected"
    | "cancelled"
    | "completed"
    | "expired";
  agreedPrice: number | null;
  priceOffers: Array<{ from: string; amount: number; at: string }>;
  createdAt: string;
  linkedVenue?: { id: number; nameRo: string } | null;
}

type Tab = "active" | "accepted" | "past";

export default function PartnerBookingsScreen() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const api = useApi();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ status?: string }>();
  const initialTab: Tab =
    params.status === "confirmed" ? "accepted" : "active";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // First resolve my artist ID (cached forever)
  const artistQuery = useQuery({
    queryKey: ["my-artist-id"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const res = await api.get<{ artist: { id: number } | null }>(
        API_PATHS.myArtist,
      );
      return res.data?.artist?.id ?? null;
    },
    staleTime: Infinity,
  });

  const bookingsQuery = useQuery({
    queryKey: ["partner-bookings", artistQuery.data],
    enabled: !!artistQuery.data,
    queryFn: async () => {
      const res = await api.get<BookingRequest[]>(API_PATHS.bookingRequests, {
        query: { artist_id: artistQuery.data ?? "" },
      });
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  // Group bookings by tab
  const grouped = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    return {
      active: all.filter((b) => b.status === "pending"),
      accepted: all.filter(
        (b) => b.status === "accepted" || b.status === "confirmed_by_client",
      ),
      past: all.filter((b) =>
        ["completed", "rejected", "cancelled", "expired"].includes(b.status),
      ),
    };
  }, [bookingsQuery.data]);

  const items = grouped[activeTab];

  const sendMessageMutation = useMutation({
    mutationFn: async ({ id }: { id: number; message?: string }) => {
      // Sending a message marks the booking as seen on the artist
      // side. For M4 we just navigate to chat — the in-line "Trimite
      // mesaj" opens the chat. Mutation here is a placeholder for the
      // sheet-based flow added in M4 Phase B.
      router.push(`/(partner)/booking/${id}` as never);
    },
  });

  const handleRefresh = useCallback(() => {
    void bookingsQuery.refetch();
  }, [bookingsQuery]);

  return (
    <SafeScreen padded={false} scroll={false}>
      <View className="border-b border-border px-5 pb-3 pt-2">
        <Text className="font-heading text-[24px] font-bold text-foreground">
          Rezervări
        </Text>
        <Text className="text-[12px] text-muted-foreground">
          {(bookingsQuery.data ?? []).length} rezervări
        </Text>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingTop: 10 }}
        >
          <TabPill
            label="Active"
            count={grouped.active.length}
            active={activeTab === "active"}
            tone="indigo"
            onPress={() => setActiveTab("active")}
          />
          <TabPill
            label="Acceptate"
            count={grouped.accepted.length}
            active={activeTab === "accepted"}
            tone="success"
            onPress={() => setActiveTab("accepted")}
          />
          <TabPill
            label="Trecute"
            count={grouped.past.length}
            active={activeTab === "past"}
            tone="default"
            onPress={() => setActiveTab("past")}
          />
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 32,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl
            refreshing={bookingsQuery.isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
          />
        }
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            onOpen={() => router.push(`/(partner)/booking/${item.id}`)}
            onAccept={() =>
              router.push(`/(partner)/booking/${item.id}/accept` as never)
            }
            onReject={() =>
              router.push(`/(partner)/booking/${item.id}/reject` as never)
            }
            onPropose={() =>
              router.push(
                `/(partner)/booking/${item.id}/propose-price` as never,
              )
            }
            onMessage={() => sendMessageMutation.mutate({ id: item.id })}
          />
        )}
        ListEmptyComponent={
          bookingsQuery.isLoading ? null : <EmptyState tab={activeTab} />
        }
      />
    </SafeScreen>
  );
}

// ─── Sub-components ──────────────────────────────────────

function TabPill({
  label,
  count,
  active,
  tone,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: BadgeTone;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-2 rounded-full border px-3 py-1.5 ${
        active ? "border-gold bg-gold/15" : "border-border bg-card"
      }`}
    >
      <Text
        className={`text-[13px] font-semibold ${active ? "text-gold" : "text-foreground/70"}`}
      >
        {label}
      </Text>
      {count > 0 && (
        <Badge tone={active ? "gold" : tone} size="sm">
          {String(count)}
        </Badge>
      )}
    </Pressable>
  );
}

function BookingCard({
  booking,
  onOpen,
  onAccept,
  onReject,
  onPropose,
  onMessage,
}: {
  booking: BookingRequest;
  onOpen: () => void;
  onAccept: () => void;
  onReject: () => void;
  onPropose: () => void;
  onMessage: () => void;
}) {
  const leadScore = computeLeadScore(booking);
  const pill = statusPill(booking.status);
  const eventLabel = eventTypeLabel(booking.eventType);

  return (
    <Card onPress={onOpen} className="gap-3 p-4">
      {/* Header: lead score + status + date + price */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          {leadScore && (
            <View
              className={`flex-row items-center gap-1 rounded-full border px-2 py-0.5 ${leadScore.bg}`}
            >
              <Text className="text-[10px]">{leadScore.emoji}</Text>
              <Text className={`text-[10px] font-semibold ${leadScore.text}`}>
                {leadScore.label}
              </Text>
            </View>
          )}
          <Badge tone={pill.tone} size="sm">
            {pill.label}
          </Badge>
        </View>
        {booking.agreedPrice != null && (
          <Text className="text-[14px] font-bold text-gold">
            {booking.agreedPrice} €
          </Text>
        )}
      </View>

      {/* Client + event */}
      <View>
        <Text className="font-heading text-[16px] font-bold text-foreground">
          {booking.clientName}
        </Text>
        <Text className="text-[12px] text-muted-foreground">
          {eventLabel} · {formatDateShortRO(booking.eventDate)}
          {booking.startTime ? ` · ${booking.startTime}` : ""}
          {booking.guestCount != null ? ` · ${booking.guestCount} invitați` : ""}
        </Text>
      </View>

      {/* Message preview */}
      {booking.message && (
        <Text
          className="text-[12px] italic text-foreground/85"
          numberOfLines={2}
        >
          “{booking.message}”
        </Text>
      )}

      {/* Footer: timestamp */}
      <Text className="text-[11px] text-muted-foreground">
        Primită {relativeTimeRO(booking.createdAt)}
      </Text>

      {/* Actions */}
      {booking.status === "pending" && (
        <View className="flex-row flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            onPress={onAccept}
            leftIcon={<CheckCircle size={14} color={colors.background} />}
          >
            Acceptă
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={onPropose}
            leftIcon={<ArrowLeftRight size={14} color={colors.gold} />}
          >
            Propune preț
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={onMessage}
            leftIcon={<MessageSquare size={14} color={colors.gold} />}
          >
            Mesaj
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={onReject}
            leftIcon={<XCircle size={14} color={colors.danger} />}
          >
            Refuză
          </Button>
        </View>
      )}
      {booking.status === "accepted" && (
        <View className="flex-row flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onPress={onMessage}
            leftIcon={<MessageSquare size={14} color={colors.gold} />}
          >
            Mesaj client
          </Button>
          <Badge tone="warning" size="sm">
            Așteaptă confirmare client
          </Badge>
        </View>
      )}
      {booking.status === "confirmed_by_client" && (
        <View className="flex-row flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onPress={onMessage}
            leftIcon={<Send size={14} color={colors.gold} />}
          >
            Trimite mesaj
          </Button>
        </View>
      )}
    </Card>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy =
    tab === "active"
      ? {
          title: "Nicio cerere nouă",
          body: "Profilul tău e online. Cererile care vor veni vor apărea aici.",
        }
      : tab === "accepted"
        ? {
            title: "Nicio rezervare confirmată",
            body: "După ce accepți o cerere, va apărea aici.",
          }
        : {
            title: "Nicio rezervare trecută",
            body: "Aici vor apărea evenimentele finalizate sau anulate.",
          };
  return (
    <View className="items-center gap-3 py-16">
      <Sparkles size={48} color={colors.mutedForeground} />
      <Text className="font-heading text-[18px] font-bold text-foreground">
        {copy.title}
      </Text>
      <Text className="max-w-[260px] text-center text-[13px] text-muted-foreground">
        {copy.body}
      </Text>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────

/** Same Hot/Warm/Cold scoring as the web inbox so partners see
 *  the same lead-priority hint on both surfaces. */
function computeLeadScore(b: BookingRequest): {
  emoji: string;
  label: string;
  bg: string;
  text: string;
} | null {
  if (
    b.status !== "pending" &&
    b.status !== "accepted" &&
    b.status !== "confirmed_by_client"
  ) {
    return null;
  }
  let score = 0;
  const price = b.agreedPrice ?? 0;
  if (price >= 3000) score += 3;
  else if (price >= 1500) score += 2;
  else if (price >= 500) score += 1;

  if (b.guestCount != null && b.guestCount >= 150) score += 2;
  else if (b.guestCount != null && b.guestCount >= 80) score += 1;

  if (b.message && b.message.length > 50) score += 1;

  // Date proximity — events <30d away are hotter (urgent decisions).
  const daysAway = Math.max(
    0,
    Math.floor(
      (new Date(b.eventDate + "T00:00:00").getTime() - Date.now()) / 86_400_000,
    ),
  );
  if (daysAway > 0 && daysAway < 30) score += 1;

  if (score >= 5) {
    return {
      emoji: "🔥",
      label: "Hot",
      bg: "border-rose-500/40 bg-rose-500/10",
      text: "text-rose-400",
    };
  }
  if (score >= 3) {
    return {
      emoji: "🍂",
      label: "Warm",
      bg: "border-amber-500/40 bg-amber-500/10",
      text: "text-amber-400",
    };
  }
  return {
    emoji: "❄️",
    label: "Cold",
    bg: "border-sky-500/40 bg-sky-500/10",
    text: "text-sky-400",
  };
}

function statusPill(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "pending":
      return { label: "Nouă", tone: "indigo" };
    case "accepted":
      return { label: "Acceptată", tone: "warning" };
    case "confirmed_by_client":
      return { label: "Confirmată", tone: "success" };
    case "completed":
      return { label: "Finalizat", tone: "success" };
    case "rejected":
      return { label: "Refuzat", tone: "danger" };
    case "cancelled":
      return { label: "Anulat", tone: "danger" };
    case "expired":
      return { label: "Expirat", tone: "default" };
    default:
      return { label: status, tone: "default" };
  }
}

