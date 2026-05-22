// Financiar — partner revenue overview.
//
// Headline stats + upcoming/past bookings list with price + status.
// Pulls from /api/v1/me/artist/dashboard for the stat panel and
// /api/v1/booking-requests?artist_id= for the list.

import { useMemo } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
} from "lucide-react-native";
import { Card, Badge, type BadgeTone } from "../../components/ui";
import { colors } from "../../constants/theme";
import { useApi } from "../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import { formatDateShortRO, eventTypeLabel } from "@epetrecere/shared/utils";

interface BookingRow {
  id: number;
  status: string;
  eventDate: string;
  eventType: string | null;
  clientName: string;
  agreedPrice: number | null;
}

export default function FinanciarScreen() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const api = useApi();

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
    queryKey: ["financiar-bookings", artistQuery.data],
    enabled: !!artistQuery.data,
    queryFn: async () => {
      const res = await api.get<BookingRow[]>(API_PATHS.bookingRequests, {
        query: { artist_id: artistQuery.data ?? "" },
      });
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  // Compute totals
  const totals = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const todayIso = today.toISOString().slice(0, 10);
    const earning = (s: string) =>
      ["accepted", "confirmed_by_client", "completed"].includes(s);
    return {
      thisMonth: all
        .filter((b) => earning(b.status) && b.eventDate >= monthStart && b.eventDate < todayIso)
        .reduce((s, b) => s + (b.agreedPrice ?? 0), 0),
      upcoming: all
        .filter((b) => earning(b.status) && b.eventDate >= todayIso)
        .reduce((s, b) => s + (b.agreedPrice ?? 0), 0),
      confirmed: all.filter(
        (b) => b.status === "confirmed_by_client" || b.status === "completed",
      ).length,
      pendingPayments: all
        .filter((b) => b.status === "confirmed_by_client" && b.agreedPrice != null)
        .reduce((s, b) => s + (b.agreedPrice ?? 0), 0),
    };
  }, [bookingsQuery.data]);

  // Sections: upcoming + past
  const sections = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return {
      upcoming: all
        .filter((b) =>
          ["accepted", "confirmed_by_client"].includes(b.status) &&
          b.eventDate >= today,
        )
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
        .slice(0, 20),
      past: all
        .filter((b) =>
          ["completed", "confirmed_by_client"].includes(b.status) &&
          b.eventDate < today,
        )
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
        .slice(0, 10),
    };
  }, [bookingsQuery.data]);

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
            Financiar
          </Text>
        </View>
      </SafeAreaView>

      {bookingsQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 32,
            gap: 16,
          }}
        >
          {/* Totals grid */}
          <View className="flex-row flex-wrap gap-3">
            <FinanceTile
              Icon={DollarSign}
              label="Venit luna"
              value={`${totals.thisMonth} €`}
              tint={colors.gold}
            />
            <FinanceTile
              Icon={TrendingUp}
              label="Viitor confirmat"
              value={`${totals.upcoming} €`}
              tint={colors.success}
            />
            <FinanceTile
              Icon={Clock}
              label="Plăți pending"
              value={`${totals.pendingPayments} €`}
              tint={colors.warning}
            />
            <FinanceTile
              Icon={CheckCircle}
              label="Total finalizate"
              value={String(totals.confirmed)}
              tint={colors.info}
            />
          </View>

          {/* Upcoming */}
          <Section title="Viitoare" items={sections.upcoming} />

          {/* Past */}
          <Section title="Trecute" items={sections.past} />
        </ScrollView>
      )}
    </View>
  );
}

function FinanceTile({
  Icon,
  label,
  value,
  tint,
}: {
  Icon: typeof DollarSign;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <Card className="min-w-[45%] flex-1 gap-2 p-3">
      <View
        style={{ backgroundColor: tint + "26" }}
        className="h-9 w-9 items-center justify-center rounded-lg"
      >
        <Icon size={18} color={tint} />
      </View>
      <View>
        <Text className="text-[11px] text-muted-foreground">{label}</Text>
        <Text className="font-heading text-[20px] font-bold text-foreground">
          {value}
        </Text>
      </View>
    </Card>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: BookingRow[];
}) {
  const router = useRouter();
  if (items.length === 0) return null;
  return (
    <Card className="gap-2">
      <Text className="font-heading text-[15px] font-bold text-foreground">
        {title}
      </Text>
      {items.map((b) => (
        <Pressable
          key={b.id}
          onPress={() => router.push(`/(partner)/booking/${b.id}` as never)}
          className="flex-row items-center gap-3 rounded-xl border border-border bg-background/40 p-2.5 active:bg-gold/5"
        >
          <View className="flex-1">
            <Text className="text-[14px] font-medium text-foreground" numberOfLines={1}>
              {eventTypeLabel(b.eventType)} — {b.clientName}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {formatDateShortRO(b.eventDate)}
            </Text>
          </View>
          {b.agreedPrice != null && (
            <Text className="text-[14px] font-bold text-gold">
              {b.agreedPrice} €
            </Text>
          )}
          <Badge tone={pillTone(b.status)} size="sm">
            {pillLabel(b.status)}
          </Badge>
        </Pressable>
      ))}
    </Card>
  );
}

function pillTone(status: string): BadgeTone {
  switch (status) {
    case "confirmed_by_client":
    case "completed":
      return "success";
    case "accepted":
      return "warning";
    default:
      return "default";
  }
}

function pillLabel(status: string): string {
  return (
    {
      accepted: "Acceptată",
      confirmed_by_client: "Confirmată",
      completed: "Finalizat",
    }[status] ?? status
  );
}
