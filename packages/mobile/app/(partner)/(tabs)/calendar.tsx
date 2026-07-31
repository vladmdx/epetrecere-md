// Partner calendar — month grid.
//
// Each day cell is colored by booking density: green for confirmed,
// gold for accepted (awaiting client confirm), red for blocked,
// muted for free. Tap a day to open a bottom sheet listing bookings
// + a button to block that day.
//
// For M4 we ship the month view with click-to-detail. Drag-to-block
// gestures land in M5 with the rest of the gesture work.

import { useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
} from "lucide-react-native";
import { SafeScreen, Card, Badge } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";

interface BookingRow {
  id: number;
  eventDate: string;
  status: string;
  clientName: string;
  startTime: string | null;
}

const WEEKDAY_SHORT_RO = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
const MONTHS_RO = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
];

export default function PartnerCalendarScreen() {
  const { isSignedIn } = useAuth();
  const api = useApi();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Pull all bookings for the artist; we filter client-side per month.
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
    queryKey: ["partner-bookings-cal", artistQuery.data],
    enabled: !!artistQuery.data,
    queryFn: async () => {
      const res = await api.get<BookingRow[]>(API_PATHS.bookingRequests, {
        query: { artist_id: artistQuery.data ?? "" },
      });
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const b of bookingsQuery.data ?? []) {
      const key = b.eventDate;
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return map;
  }, [bookingsQuery.data]);

  // Manually-blocked days for the visible month. Fetched from the
  // availability calendar (separate from bookings) so the partner can mark
  // days off even when there's no booking on them.
  const queryClient = useQueryClient();
  const monthStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;

  const calendarQuery = useQuery({
    queryKey: ["partner-calendar-events", artistQuery.data, monthStr],
    enabled: !!artistQuery.data,
    queryFn: async () => {
      const res = await api.get<{ date: string; status: string }[]>(
        API_PATHS.calendar,
        {
          query: {
            entity_type: "artist",
            entity_id: artistQuery.data ?? "",
            month: monthStr,
          },
        },
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const blockedDates = useMemo(() => {
    const s = new Set<string>();
    for (const e of calendarQuery.data ?? []) {
      if (e.status === "blocked") s.add(e.date);
    }
    return s;
  }, [calendarQuery.data]);

  const blockMutation = useMutation({
    mutationFn: async ({ date, block }: { date: string; block: boolean }) => {
      if (!artistQuery.data) throw new Error("no-artist");
      const res = await api.post(API_PATHS.calendar, {
        entity_type: "artist",
        entity_id: artistQuery.data,
        dates: [date],
        status: block ? "blocked" : "available",
      });
      if (!res.ok) throw new Error(res.error?.message ?? "failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["partner-calendar-events"],
      });
    },
    onError: () => {
      Alert.alert("Eroare", "Nu am putut actualiza ziua. Încearcă din nou.");
    },
  });

  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = `${MONTHS_RO[cursor.getMonth()]} ${cursor.getFullYear()}`;

  function goPrev() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  }
  function goNext() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  }

  const selectedBookings = selectedDate
    ? bookingsByDay.get(selectedDate) ?? []
    : [];
  const selectedIsBlocked = selectedDate ? blockedDates.has(selectedDate) : false;

  return (
    <SafeScreen padded scroll>
      <View className="flex-row items-center justify-between pt-2">
        <Pressable onPress={goPrev} hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full bg-card">
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text className="font-heading text-[20px] font-bold text-foreground">
          {monthLabel}
        </Text>
        <Pressable onPress={goNext} hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full bg-card">
          <ChevronRight size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Weekday header */}
      <View className="flex-row">
        {WEEKDAY_SHORT_RO.map((d) => (
          <View key={d} className="flex-1 items-center py-1">
            <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* Grid */}
      {bookingsQuery.isLoading ? (
        <View className="items-center py-12">
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <View>
          {chunkArray(cells, 7).map((week, wIdx) => (
            <View key={wIdx} className="flex-row gap-1 mb-1">
              {week.map((cell, dIdx) => (
                <DayCell
                  key={`${wIdx}-${dIdx}`}
                  cell={cell}
                  bookings={cell.iso ? bookingsByDay.get(cell.iso) ?? [] : []}
                  blocked={cell.iso ? blockedDates.has(cell.iso) : false}
                  selected={cell.iso === selectedDate}
                  onPress={() => cell.iso && setSelectedDate(cell.iso)}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Legend */}
      <View className="flex-row flex-wrap gap-2 pt-2">
        <LegendDot color={colors.success} label="Confirmat" />
        <LegendDot color={colors.warning} label="Așteaptă confirmare" />
        <LegendDot color={colors.indigo} label="Nou" />
        <LegendDot color={colors.danger} label="Refuzat" />
        <View className="flex-row items-center gap-1.5">
          <Lock size={11} color={colors.mutedForeground} />
          <Text className="text-[11px] text-muted-foreground">Blocat</Text>
        </View>
      </View>

      {/* Selected day panel */}
      {selectedDate && (
        <Card className="gap-3 mt-2">
          <View className="flex-row items-center justify-between">
            <Text className="font-heading text-[16px] font-bold text-foreground">
              {formatDay(selectedDate)}
            </Text>
            <Pressable hitSlop={8} onPress={() => setSelectedDate(null)}>
              <Text className="text-[12px] text-gold">Închide</Text>
            </Pressable>
          </View>
          {selectedBookings.length === 0 ? (
            <Text className="text-[13px] text-muted-foreground">
              {selectedIsBlocked
                ? "Zi blocată manual — nu primești cereri în această zi."
                : "Nicio rezervare în această zi. Poți bloca ziua manual mai jos."}
            </Text>
          ) : (
            <View className="gap-2">
              {selectedBookings.map((b) => (
                <BookingRowInPanel key={b.id} booking={b} />
              ))}
            </View>
          )}
          <Pressable
            disabled={blockMutation.isPending}
            onPress={() =>
              selectedDate &&
              blockMutation.mutate({
                date: selectedDate,
                block: !selectedIsBlocked,
              })
            }
            className={`flex-row items-center justify-center gap-2 rounded-lg border px-3 py-2.5 ${
              selectedIsBlocked
                ? "border-rose-500/40 bg-rose-500/10"
                : "border-dashed border-gold/40"
            } ${blockMutation.isPending ? "opacity-50" : "active:opacity-80"}`}
          >
            {blockMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : selectedIsBlocked ? (
              <>
                <Unlock size={14} color={colors.danger} />
                <Text className="text-[12px] font-medium text-rose-300">
                  Deblochează ziua
                </Text>
              </>
            ) : (
              <>
                <Lock size={14} color={colors.gold} />
                <Text className="text-[12px] font-medium text-gold">
                  Blochează ziua
                </Text>
              </>
            )}
          </Pressable>
        </Card>
      )}
    </SafeScreen>
  );
}

interface Cell {
  iso: string | null;
  dayNum: number;
  isToday: boolean;
  isOtherMonth: boolean;
}

function buildMonthGrid(monthStart: Date): Cell[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // ISO weekday: Mon=1..Sun=7. JS getDay: Sun=0..Sat=6.
  const firstDow = new Date(year, month, 1).getDay();
  // Convert to Mon-first: Sun→6, Mon→0, Tue→1, ...
  const leadingBlanks = (firstDow + 6) % 7;
  const today = new Date();
  const todayIso = isoOf(today);
  const cells: Cell[] = [];
  for (let i = 0; i < leadingBlanks; i++) {
    cells.push({ iso: null, dayNum: 0, isToday: false, isOtherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const iso = isoOf(date);
    cells.push({
      iso,
      dayNum: d,
      isToday: iso === todayIso,
      isOtherMonth: false,
    });
  }
  // Pad to multiple of 7
  while (cells.length % 7 !== 0) {
    cells.push({ iso: null, dayNum: 0, isToday: false, isOtherMonth: true });
  }
  return cells;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MONTHS_RO[d.getMonth()]} ${d.getFullYear()}`;
}

function DayCell({
  cell,
  bookings,
  blocked,
  selected,
  onPress,
}: {
  cell: Cell;
  bookings: BookingRow[];
  blocked: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const dotColor = dominantStatusColor(bookings);

  if (cell.iso === null) {
    return <View className="aspect-square flex-1 opacity-30" />;
  }

  return (
    <Pressable
      onPress={onPress}
      className={`aspect-square flex-1 items-center justify-center rounded-lg ${
        selected
          ? "border-2 border-gold bg-gold/15"
          : blocked
            ? "border border-rose-500/30 bg-rose-500/10"
            : cell.isToday
              ? "border border-gold/40 bg-card"
              : "bg-card"
      }`}
    >
      <Text
        className={`text-[14px] font-semibold ${
          cell.isToday
            ? "text-gold"
            : blocked
              ? "text-rose-300/80"
              : "text-foreground"
        }`}
      >
        {cell.dayNum}
      </Text>
      {blocked ? (
        <Lock size={9} color={colors.danger} style={{ marginTop: 2 }} />
      ) : dotColor ? (
        <View
          style={{ backgroundColor: dotColor }}
          className="mt-0.5 h-1.5 w-1.5 rounded-full"
        />
      ) : null}
    </Pressable>
  );
}

function dominantStatusColor(bookings: BookingRow[]): string | null {
  if (bookings.length === 0) return null;
  if (bookings.some((b) => b.status === "confirmed_by_client" || b.status === "completed")) {
    return colors.success;
  }
  if (bookings.some((b) => b.status === "accepted")) return colors.warning;
  if (bookings.some((b) => b.status === "pending")) return colors.indigo;
  if (bookings.some((b) => b.status === "rejected" || b.status === "cancelled")) {
    return colors.danger;
  }
  return colors.mutedForeground;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ backgroundColor: color }} className="h-2 w-2 rounded-full" />
      <Text className="text-[11px] text-muted-foreground">{label}</Text>
    </View>
  );
}

function BookingRowInPanel({ booking }: { booking: BookingRow }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/(partner)/booking/${booking.id}`)}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-background/40 p-2.5 active:bg-gold/5"
    >
      <View
        style={{ backgroundColor: dominantStatusColor([booking]) ?? colors.mutedForeground }}
        className="h-2 w-2 rounded-full"
      />
      <View className="flex-1">
        <Text className="text-[14px] font-medium text-foreground">
          {booking.clientName}
        </Text>
        {booking.startTime && (
          <Text className="text-[11px] text-muted-foreground">
            {booking.startTime}
          </Text>
        )}
      </View>
      <Badge tone={booking.status === "confirmed_by_client" ? "success" : "default"} size="sm">
        {booking.status}
      </Badge>
    </Pressable>
  );
}
