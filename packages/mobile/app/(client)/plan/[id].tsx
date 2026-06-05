// Event plan detail.
//
// Single screen with a header (countdown + progress) and a tab bar
// underneath that swaps the body. We don't use nested Expo Router
// tabs here — they'd reset the scroll position on every tab switch
// and force a remount. Local state holds the active tab and we
// render the corresponding subtree.
//
// Tabs:
//   overview  — countdown + Parteneri/Invitați/Checklist progress bars
//   checklist — tap-to-toggle list of tasks
//   guests    — guest list with RSVP pills + add button
//   bookings  — services + bookings linked to this plan
//   moments   — link to Photo Moments screen (separate route)

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  CheckCircle,
  Clock,
  Camera,
  Sparkles,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ProgressBar } from "../../../components/ui";
import { ChecklistTab } from "../../../components/plan/ChecklistTab";
import { GuestsTab } from "../../../components/plan/GuestsTab";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import {
  eventTypeLabel,
  formatDateRO,
  parseIsoDate,
} from "@epetrecere/shared/utils";

interface PlanDetail {
  plan: {
    id: number;
    title: string;
    eventType: string | null;
    eventDate: string | null;
    startTime: string | null;
    location: string | null;
    guestCountTarget: number | null;
    venueNeeded: boolean;
    checklistEnabled: boolean;
    budgetEnabled: boolean;
    guestsEnabled: boolean;
    seatingEnabled: boolean;
    momentsEnabled: boolean;
  };
  checklist?: Array<{ id: number; title: string; done: boolean }>;
  guests?: Array<{
    id: number;
    fullName: string;
    rsvp: "pending" | "accepted" | "declined" | "maybe";
    partySize: number;
  }>;
}

// Booking requests linked to this plan. Fetched separately from
// /booking-requests?event_plan_id=… — the plan GET does not include them.
interface PlanBooking {
  id: number;
  status: string;
}

type Tab = "overview" | "checklist" | "guests" | "bookings" | "moments";

export default function PlanDetailScreen() {
  const { id, tab: initialTab } = useLocalSearchParams<{
    id: string;
    tab?: Tab;
  }>();
  const planId = Number(id);
  const router = useRouter();
  const api = useApi();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "overview");

  const planQuery = useQuery({
    queryKey: ["plan", planId],
    enabled: Number.isFinite(planId),
    queryFn: async () => {
      const res = await api.get<PlanDetail>(API_PATHS.eventPlan(planId));
      return res.data;
    },
  });

  // The plan GET (/event-plans/[id]) returns plan/checklist/guests/tables/seats
  // but NOT the linked booking requests, so the "Parteneri" progress can't be
  // derived from it. Fetch them separately from /booking-requests, which
  // accepts ?event_plan_id and gates on plan ownership. The endpoint returns a
  // bare array, so guard with Array.isArray.
  const bookingsQuery = useQuery({
    queryKey: ["plan-bookings", planId],
    enabled: Number.isFinite(planId),
    queryFn: async () => {
      const res = await api.get<PlanBooking[]>(API_PATHS.bookingRequests, {
        query: { event_plan_id: planId },
      });
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  if (planQuery.isLoading || !planQuery.data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  const detail = planQuery.data;
  const plan = detail.plan;

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={["top"]}>
        {/* Header */}
        <View className="flex-row items-center gap-2 px-4 py-3">
          <Pressable
            hitSlop={8}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full"
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {eventTypeLabel(plan.eventType)}
            </Text>
            <Text
              className="font-heading text-[18px] font-bold text-foreground"
              numberOfLines={1}
            >
              {plan.title}
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
          className="border-b border-border pb-3 pt-1"
        >
          <TabChip
            label="Prezentare"
            active={activeTab === "overview"}
            onPress={() => setActiveTab("overview")}
          />
          {plan.checklistEnabled && (
            <TabChip
              label="Checklist"
              active={activeTab === "checklist"}
              onPress={() => setActiveTab("checklist")}
            />
          )}
          {plan.guestsEnabled && (
            <TabChip
              label="Invitați"
              active={activeTab === "guests"}
              onPress={() => setActiveTab("guests")}
            />
          )}
          <TabChip
            label="Rezervări"
            active={activeTab === "bookings"}
            onPress={() => setActiveTab("bookings")}
          />
          {plan.momentsEnabled && (
            <TabChip
              label="Photo Moments"
              active={activeTab === "moments"}
              onPress={() => setActiveTab("moments")}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 40,
          gap: 16,
        }}
      >
        {activeTab === "overview" && (
          <OverviewTab detail={detail} bookings={bookingsQuery.data ?? []} />
        )}
        {activeTab === "checklist" && <ChecklistTab planId={planId} />}
        {activeTab === "guests" && <GuestsTab planId={planId} />}
        {activeTab === "bookings" && <BookingsTabStub />}
        {activeTab === "moments" && (
          <MomentsTab
            onOpen={() => router.push(`/(client)/moments/${planId}` as never)}
          />
        )}
      </ScrollView>
    </View>
  );
}

function TabChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      className={`rounded-full border px-3 py-1.5 ${
        active ? "border-gold bg-gold/15" : "border-border bg-card"
      }`}
    >
      <Text
        className={`text-[13px] font-semibold ${active ? "text-gold" : "text-foreground/70"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Overview tab ──────────────────────────────────────

function OverviewTab({
  detail,
  bookings,
}: {
  detail: PlanDetail;
  bookings: PlanBooking[];
}) {
  const { plan } = detail;
  const dateLabel = plan.eventDate ? formatDateRO(plan.eventDate) : null;
  const countdown = useCountdown(plan.eventDate);

  const checklistTotal = detail.checklist?.length ?? 0;
  const checklistDone =
    detail.checklist?.filter((i) => i.done).length ?? 0;
  const checklistPct = checklistTotal
    ? Math.round((checklistDone / checklistTotal) * 100)
    : 0;

  const guestTotal = plan.guestCountTarget ?? 0;
  const guestAccepted =
    detail.guests
      ?.filter((g) => g.rsvp === "accepted")
      .reduce((s, g) => s + (g.partySize || 1), 0) ?? 0;
  const guestPct = guestTotal
    ? Math.min(100, Math.round((guestAccepted / guestTotal) * 100))
    : 0;

  // Count only bookings that still represent a live partner slot. Dead
  // requests (rejected / cancelled / expired) free the slot up again on the
  // server, so they shouldn't inflate the "Parteneri" denominator.
  const activeBookings = bookings.filter(
    (b) =>
      b.status !== "rejected" &&
      b.status !== "cancelled" &&
      b.status !== "expired",
  );
  const bookingTotal = activeBookings.length;
  const bookingConfirmed = activeBookings.filter(
    (b) => b.status === "accepted" || b.status === "confirmed_by_client",
  ).length;
  const bookingPct = bookingTotal
    ? Math.round((bookingConfirmed / bookingTotal) * 100)
    : 0;

  return (
    <>
      {/* Meta card */}
      <Card className="gap-3">
        {dateLabel && (
          <MetaLine Icon={Calendar} value={dateLabel} secondary={plan.startTime ?? undefined} />
        )}
        {plan.location && <MetaLine Icon={MapPin} value={plan.location} />}
        {plan.guestsEnabled && plan.guestCountTarget != null && (
          <MetaLine Icon={Users} value={`${plan.guestCountTarget} invitați`} />
        )}
      </Card>

      {/* Countdown */}
      {countdown && (
        <Card className="items-center gap-2 p-5">
          <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Mai e până la eveniment
          </Text>
          <View className="flex-row items-end gap-4">
            <CountdownBlock value={countdown.days} label="zile" />
            <CountdownBlock value={countdown.hours} label="ore" />
            <CountdownBlock value={countdown.minutes} label="min" />
            <CountdownBlock value={countdown.seconds} label="sec" />
          </View>
        </Card>
      )}

      {/* Progress bars */}
      <Card className="gap-4 p-5">
        <Text className="font-heading text-[16px] font-bold text-foreground">
          Progresul evenimentului
        </Text>
        <Text className="text-[12px] text-muted-foreground">
          Verde = confirmat · Galben = în așteptare · Gri = neînceput
        </Text>

        {bookingTotal > 0 && (
          <ProgressLine
            label="Parteneri"
            value={bookingPct}
            extraRight={`${bookingConfirmed}/${bookingTotal} confirmați`}
          />
        )}
        {plan.guestsEnabled && (
          <ProgressLine
            label="Invitați"
            value={guestPct}
            extraRight={`${guestAccepted} acceptați din ${guestTotal}`}
          />
        )}
        {plan.checklistEnabled && (
          <ProgressLine
            label="Checklist"
            value={checklistPct}
            extraRight={`${checklistDone} din ${checklistTotal} bifate (${checklistPct}%)`}
          />
        )}
      </Card>

      {/* Footer note */}
      <View className="flex-row items-start gap-2 rounded-2xl border border-gold/20 bg-gold/5 p-4">
        <Sparkles size={16} color={colors.gold} />
        <Text className="flex-1 text-[12px] leading-5 text-foreground/85">
          Evenimentul poate fi marcat ca finalizat după ce a avut loc și toate
          cererile au răspuns.
        </Text>
      </View>
    </>
  );
}

function MetaLine({
  Icon,
  value,
  secondary,
}: {
  Icon: typeof Calendar;
  value: string;
  secondary?: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-gold/15">
        <Icon size={16} color={colors.gold} />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] text-foreground">{value}</Text>
        {secondary && (
          <Text className="text-[12px] text-muted-foreground">{secondary}</Text>
        )}
      </View>
    </View>
  );
}

function CountdownBlock({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center">
      <Text className="font-heading text-[32px] font-bold text-foreground">
        {String(value).padStart(2, "0")}
      </Text>
      <Text className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

function ProgressLine({
  label,
  value,
  extraRight,
}: {
  label: string;
  value: number;
  extraRight?: string;
}) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-[13px] font-semibold text-foreground">{label}</Text>
        {extraRight && (
          <Text className="text-[11px] text-muted-foreground">{extraRight}</Text>
        )}
      </View>
      <ProgressBar value={value} />
    </View>
  );
}

function useCountdown(eventDate: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    if (!eventDate) return null;
    const target = parseIsoDate(eventDate);
    if (!target) return null;
    const diff = target.getTime() - now;
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff / 3_600_000) % 24);
    const minutes = Math.floor((diff / 60_000) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    return { days, hours, minutes, seconds };
  }, [eventDate, now]);
}

// ─── Tab stubs (filled out next phase) ───────────────────

function BookingsTabStub() {
  return <TabPlaceholder Icon={Clock} title="Rezervări" />;
}
function MomentsTab({ onOpen }: { onOpen: () => void }) {
  return (
    <Card onPress={onOpen} className="items-center gap-3 p-6">
      <Camera size={40} color={colors.gold} />
      <Text className="font-heading text-[18px] font-bold text-foreground">
        Deschide Photo Moments
      </Text>
      <Text className="text-center text-[13px] text-muted-foreground">
        Vezi pozele, scanează QR-ul, descarcă album.
      </Text>
    </Card>
  );
}

function TabPlaceholder({
  Icon,
  title,
}: {
  Icon: typeof Clock;
  title: string;
}) {
  return (
    <Card className="items-center gap-3 p-8">
      <Icon size={40} color={colors.mutedForeground} />
      <Text className="font-heading text-[16px] font-bold text-foreground">
        {title}
      </Text>
      <Text className="text-center text-[12px] text-muted-foreground">
        În curând — această secțiune se construiește în M3 partea 2.
      </Text>
    </Card>
  );
}
