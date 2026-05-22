// My bookings — list of all booking requests this user has sent.
//
// Grouped by status: Active (pending / accepted) vs. Trecute (completed,
// rejected, cancelled). Each card shows the vendor, date, status pill,
// and a chevron to the detail screen.

import { useMemo, useCallback } from "react";
import { View, Text, FlatList, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useUser } from "@clerk/clerk-expo";
import {
  ArrowLeft,
  ChevronRight,
  BookOpen,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Badge, type BadgeTone } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import { formatDateShortRO, eventTypeLabel } from "@epetrecere/shared/utils";

interface BookingRequest {
  id: number;
  status: string;
  artistName: string | null;
  venueName: string | null;
  eventDate: string;
  eventType: string | null;
  agreedPrice: number | null;
}

export default function MyBookingsScreen() {
  const { isSignedIn } = useUser();
  const { user } = useUser();
  const router = useRouter();
  const api = useApi();

  const bookingsQuery = useQuery({
    queryKey: ["my", "bookings"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const res = await api.get<BookingRequest[]>(API_PATHS.bookingRequests, {
        query: { client_email: user?.primaryEmailAddress?.emailAddress ?? "" },
      });
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const grouped = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const active = all.filter((b) =>
      ["pending", "accepted", "confirmed_by_client"].includes(b.status),
    );
    const past = all.filter((b) =>
      ["completed", "rejected", "cancelled", "expired"].includes(b.status),
    );
    return [
      { title: "Active", items: active },
      { title: "Trecute", items: past },
    ].filter((s) => s.items.length > 0);
  }, [bookingsQuery.data]);

  const handleRefresh = useCallback(() => {
    void bookingsQuery.refetch();
  }, [bookingsQuery]);

  // Flatten into a single FlatList for performance (SectionList re-renders
  // headers on every state change of the parent).
  type Row =
    | { type: "header"; title: string; key: string }
    | { type: "item"; booking: BookingRequest; key: string };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const section of grouped) {
      out.push({ type: "header", title: section.title, key: `h-${section.title}` });
      for (const b of section.items) {
        out.push({ type: "item", booking: b, key: `b-${b.id}` });
      }
    }
    return out;
  }, [grouped]);

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
          <Text className="font-heading text-[20px] font-bold text-foreground">
            Rezervările Mele
          </Text>
        </View>
      </SafeAreaView>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 32,
          gap: 8,
        }}
        refreshControl={
          <RefreshControl
            refreshing={bookingsQuery.isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
          />
        }
        renderItem={({ item }) =>
          item.type === "header" ? (
            <Text className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {item.title}
            </Text>
          ) : (
            <BookingRow
              booking={item.booking}
              onPress={() =>
                router.push(`/(client)/bookings/${item.booking.id}`)
              }
            />
          )
        }
        ListEmptyComponent={
          bookingsQuery.isLoading ? null : (
            <View className="items-center gap-3 py-16">
              <BookOpen size={48} color={colors.mutedForeground} />
              <Text className="font-heading text-[18px] font-bold text-foreground">
                Nicio rezervare încă
              </Text>
              <Text className="max-w-[260px] text-center text-[13px] text-muted-foreground">
                Caută artiști sau săli și trimite o cerere — apar aici imediat.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

function BookingRow({
  booking,
  onPress,
}: {
  booking: BookingRequest;
  onPress: () => void;
}) {
  const vendor = booking.artistName ?? booking.venueName ?? "Furnizor";
  const pill = statusPill(booking.status);

  return (
    <Card onPress={onPress} className="flex-row items-center gap-3">
      <View
        className={`h-10 w-10 items-center justify-center rounded-xl ${pill.bg}`}
      >
        <BookOpen size={18} color={pill.iconColor} />
      </View>
      <View className="flex-1">
        <Text
          className="text-[15px] font-semibold text-foreground"
          numberOfLines={1}
        >
          {vendor}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          <Text className="text-[12px] text-muted-foreground">
            {eventTypeLabel(booking.eventType)} ·{" "}
            {formatDateShortRO(booking.eventDate)}
          </Text>
          {booking.agreedPrice != null && (
            <Text className="text-[12px] font-semibold text-gold">
              {booking.agreedPrice} €
            </Text>
          )}
        </View>
      </View>
      <Badge tone={pill.tone} size="sm">
        {pill.label}
      </Badge>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Card>
  );
}

function statusPill(status: string): {
  label: string;
  tone: BadgeTone;
  bg: string;
  iconColor: string;
} {
  switch (status) {
    case "pending":
      return {
        label: "Trimisă",
        tone: "indigo",
        bg: "bg-indigo-500/15",
        iconColor: colors.indigo,
      };
    case "accepted":
      return {
        label: "Confirmare",
        tone: "warning",
        bg: "bg-amber-500/15",
        iconColor: colors.warning,
      };
    case "confirmed_by_client":
      return {
        label: "Confirmat",
        tone: "success",
        bg: "bg-emerald-500/15",
        iconColor: colors.success,
      };
    case "completed":
      return {
        label: "Finalizat",
        tone: "success",
        bg: "bg-emerald-500/15",
        iconColor: colors.success,
      };
    case "rejected":
      return {
        label: "Refuzat",
        tone: "danger",
        bg: "bg-rose-500/15",
        iconColor: colors.danger,
      };
    case "cancelled":
      return {
        label: "Anulat",
        tone: "danger",
        bg: "bg-rose-500/15",
        iconColor: colors.danger,
      };
    case "expired":
      return {
        label: "Expirat",
        tone: "default",
        bg: "bg-muted",
        iconColor: colors.mutedForeground,
      };
    default:
      return {
        label: status,
        tone: "default",
        bg: "bg-muted",
        iconColor: colors.mutedForeground,
      };
  }
}
