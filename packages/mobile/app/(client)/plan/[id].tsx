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
import { useUser } from "@clerk/clerk-expo";
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
  bookings?: Array<{ id: number; status: string }>;
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

  if (planQuery.isLoading || !planQuery.data) {
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

  const detail = planQuery.data;
  const plan = detail.plan;

  return (
    <View className="flex-1 bg-background" style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={["top"]}>
        {/* Header */}
        <View
          className="flex-row items-center gap-2 px-4 py-3"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 12,
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
          <View className="flex-1" style={{ flex: 1 }}>
            <Text
              className="text-[11px] uppercase tracking-widest text-muted-foreground"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 2,
                color: colors.mutedForeground,
              }}
            >
              {eventTypeLabel(plan.eventType)}
            </Text>
            <Text
              className="font-heading text-[18px] font-bold text-foreground"
              numberOfLines={1}
              style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}
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
          style={{
            borderBottomWidth: 1,
            borderColor: colors.border,
            paddingBottom: 12,
            paddingTop: 4,
          }}
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
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 40,
          gap: 16,
        }}
      >
        {activeTab === "overview" && <OverviewTab detail={detail} />}
        {activeTab === "checklist" && <ChecklistTab planId={planId} />}
        {activeTab === "guests" && <GuestsTab planId={planId} />}
        {activeTab === "bookings" && (
          <BookingsTab planId={planId} eventDate={plan.eventDate} />
        )}
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
      style={{
        borderRadius: 9999,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderColor: active ? colors.gold : colors.border,
        backgroundColor: active ? "rgba(201,168,76,0.15)" : colors.card,
      }}
    >
      <Text
        className={`text-[13px] font-semibold ${active ? "text-gold" : "text-foreground/70"}`}
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: active ? colors.gold : "rgba(247,245,238,0.7)",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Overview tab ──────────────────────────────────────

function OverviewTab({ detail }: { detail: PlanDetail }) {
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

  const bookingTotal = detail.bookings?.length ?? 0;
  const bookingConfirmed =
    detail.bookings?.filter(
      (b) => b.status === "accepted" || b.status === "confirmed_by_client",
    ).length ?? 0;
  const bookingPct = bookingTotal
    ? Math.round((bookingConfirmed / bookingTotal) * 100)
    : 0;

  return (
    <>
      {/* Meta card */}
      <Card className="gap-3" style={{ gap: 12 }}>
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
        <Card
          className="items-center gap-2 p-5"
          style={{ alignItems: "center", gap: 8, padding: 20 }}
        >
          <Text
            className="text-[11px] uppercase tracking-widest text-muted-foreground"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 2,
              color: colors.mutedForeground,
            }}
          >
            Mai e până la eveniment
          </Text>
          <View
            className="flex-row items-end gap-4"
            style={{ flexDirection: "row", alignItems: "flex-end", gap: 16 }}
          >
            <CountdownBlock value={countdown.days} label="zile" />
            <CountdownBlock value={countdown.hours} label="ore" />
            <CountdownBlock value={countdown.minutes} label="min" />
            <CountdownBlock value={countdown.seconds} label="sec" />
          </View>
        </Card>
      )}

      {/* Progress bars */}
      <Card className="gap-4 p-5" style={{ gap: 16, padding: 20 }}>
        <Text
          className="font-heading text-[16px] font-bold text-foreground"
          style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}
        >
          Progresul evenimentului
        </Text>
        <Text
          className="text-[12px] text-muted-foreground"
          style={{ fontSize: 12, color: colors.mutedForeground }}
        >
          Verde = confirmat · Galben = în așteptare · Gri = neînceput
        </Text>

        <ProgressLine
          label="Parteneri"
          value={bookingPct}
          extraRight={`${bookingConfirmed}/${bookingTotal || 0} confirmați`}
        />
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
      <View
        className="flex-row items-start gap-2 rounded-2xl border border-gold/20 bg-gold/5 p-4"
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(201,168,76,0.2)",
          backgroundColor: "rgba(201,168,76,0.05)",
          padding: 16,
        }}
      >
        <Sparkles size={16} color={colors.gold} />
        <Text
          className="flex-1 text-[12px] leading-5 text-foreground/85"
          style={{ flex: 1, fontSize: 12, lineHeight: 20, color: "rgba(247,245,238,0.85)" }}
        >
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
    <View
      className="flex-row items-center gap-3"
      style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-lg bg-gold/15"
        style={{
          height: 36,
          width: 36,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          backgroundColor: "rgba(201,168,76,0.15)",
        }}
      >
        <Icon size={16} color={colors.gold} />
      </View>
      <View className="flex-1" style={{ flex: 1 }}>
        <Text
          className="text-[14px] text-foreground"
          style={{ fontSize: 14, color: colors.foreground }}
        >
          {value}
        </Text>
        {secondary && (
          <Text
            className="text-[12px] text-muted-foreground"
            style={{ fontSize: 12, color: colors.mutedForeground }}
          >
            {secondary}
          </Text>
        )}
      </View>
    </View>
  );
}

function CountdownBlock({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center" style={{ alignItems: "center" }}>
      <Text
        className="font-heading text-[32px] font-bold text-foreground"
        style={{ fontSize: 32, fontWeight: "700", color: colors.foreground }}
      >
        {String(value).padStart(2, "0")}
      </Text>
      <Text
        className="text-[10px] uppercase tracking-widest text-muted-foreground"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 2,
          color: colors.mutedForeground,
        }}
      >
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
    <View className="gap-1.5" style={{ gap: 6 }}>
      <View
        className="flex-row items-center justify-between"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <Text
          className="text-[13px] font-semibold text-foreground"
          style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}
        >
          {label}
        </Text>
        {extraRight && (
          <Text
            className="text-[11px] text-muted-foreground"
            style={{ fontSize: 11, color: colors.mutedForeground }}
          >
            {extraRight}
          </Text>
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

// ─── Bookings tab ────────────────────────────────────────

interface BookingRequest {
  id: number;
  eventPlanId: number | null;
  artistId: number | null;
  venueId: number | null;
  status: string;
  artistName: string | null;
  venueName: string | null;
  categoryNames?: string[] | null;
  eventDate: string;
}

const BOOKING_STATUS: Record<string, { label: string; tint: string }> = {
  pending: { label: "În așteptare", tint: colors.gold },
  accepted: { label: "Acceptată", tint: colors.success },
  confirmed_by_client: { label: "Confirmată", tint: colors.success },
  rejected: { label: "Refuzată", tint: "#EF4444" },
  cancelled: { label: "Anulată", tint: colors.mutedForeground },
  completed: { label: "Finalizată", tint: colors.success },
  expired: { label: "Expirată", tint: colors.mutedForeground },
};

function BookingsTab({
  planId,
  eventDate,
}: {
  planId: number;
  eventDate: string | null;
}) {
  const api = useApi();
  const router = useRouter();
  const { user } = useUser();

  // Same source + filter as the cabinet: fetch the client's bookings and keep
  // the ones linked to this plan (or same-date bookings not yet linked).
  const bookingsQuery = useQuery({
    queryKey: ["plan-bookings", planId],
    queryFn: async () => {
      const res = await api.get<BookingRequest[]>(API_PATHS.bookingRequests, {
        query: { client_email: user?.primaryEmailAddress?.emailAddress ?? "" },
      });
      const all = Array.isArray(res.data) ? res.data : [];
      return all.filter(
        (b) =>
          b.eventPlanId === planId ||
          (b.eventPlanId == null &&
            eventDate != null &&
            b.eventDate === eventDate),
      );
    },
  });

  if (bookingsQuery.isLoading) {
    return (
      <View
        className="items-center py-10"
        style={{ alignItems: "center", paddingVertical: 40 }}
      >
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  const bookings = bookingsQuery.data ?? [];

  if (bookings.length === 0) {
    return (
      <Card
        className="items-center gap-3 p-8"
        style={{ alignItems: "center", gap: 12, padding: 32 }}
      >
        <Clock size={40} color={colors.mutedForeground} />
        <Text
          className="font-heading text-[16px] font-bold text-foreground"
          style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}
        >
          Nicio cerere încă
        </Text>
        <Text
          className="text-center text-[12px] text-muted-foreground"
          style={{ textAlign: "center", fontSize: 12, color: colors.mutedForeground }}
        >
          Trimite cereri către artiști și săli — apar aici, legate de eveniment.
        </Text>
        <Pressable
          onPress={() => router.push("/(client)/(tabs)/search")}
          className="mt-1 flex-row items-center gap-2 rounded-lg bg-gold px-5 py-2.5"
          style={{
            marginTop: 4,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderRadius: 14,
            backgroundColor: colors.gold,
            paddingHorizontal: 20,
            paddingVertical: 10,
          }}
        >
          <Sparkles size={16} color={colors.background} />
          <Text
            className="text-[14px] font-semibold text-background"
            style={{ fontSize: 14, fontWeight: "600", color: colors.background }}
          >
            Caută furnizori
          </Text>
        </Pressable>
      </Card>
    );
  }

  return (
    <View className="gap-3" style={{ gap: 12 }}>
      {bookings.map((b) => {
        const cfg = BOOKING_STATUS[b.status] ?? {
          label: b.status,
          tint: colors.mutedForeground,
        };
        const name = b.artistName ?? b.venueName ?? "Furnizor";
        const category = b.categoryNames?.[0] ?? (b.venueId ? "Sală" : "Artist");
        return (
          <Pressable
            key={b.id}
            onPress={() => router.push(`/(client)/bookings/${b.id}`)}
          >
            <Card
              className="flex-row items-center gap-3"
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View className="flex-1" style={{ flex: 1 }}>
                <Text
                  className="text-[15px] font-semibold text-foreground"
                  numberOfLines={1}
                  style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}
                >
                  {name}
                </Text>
                <Text
                  className="mt-0.5 text-[12px] text-muted-foreground"
                  numberOfLines={1}
                  style={{ marginTop: 2, fontSize: 12, color: colors.mutedForeground }}
                >
                  {category}
                  {b.eventDate ? ` · ${formatDateRO(b.eventDate)}` : ""}
                </Text>
              </View>
              <View
                style={[
                  { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
                  { backgroundColor: cfg.tint + "22" },
                ]}
                className="rounded-full px-3 py-1"
              >
                <Text
                  style={[{ fontSize: 11, fontWeight: "600" }, { color: cfg.tint }]}
                  className="text-[11px] font-semibold"
                >
                  {cfg.label}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

function MomentsTab({ onOpen }: { onOpen: () => void }) {
  return (
    <Card
      onPress={onOpen}
      className="items-center gap-3 p-6"
      style={{ alignItems: "center", gap: 12, padding: 24 }}
    >
      <Camera size={40} color={colors.gold} />
      <Text
        className="font-heading text-[18px] font-bold text-foreground"
        style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}
      >
        Deschide Photo Moments
      </Text>
      <Text
        className="text-center text-[13px] text-muted-foreground"
        style={{ textAlign: "center", fontSize: 13, color: colors.mutedForeground }}
      >
        Vezi pozele, scanează QR-ul, descarcă album.
      </Text>
    </Card>
  );
}

