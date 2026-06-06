// Client cabinet — mobile twin of the web redesign at /cabinet.
//
// Layout (top to bottom):
//   1. Welcome header (Bun venit, <name>)
//   2. Empty state when no active plan, OR:
//   3. Hero event card — event type · title, date/location/venue,
//      guest count, progress bar, "Vezi planul meu" CTA, venue image
//   4. Next-step card (single most important action)
//   5. 3 stat tiles (RSVP / pending bookings / messages)
//   6. Services strip — venue/music/photo/moderator/decor
//   7. Recent messages + Buget (or Photo Moments / Recenzii fallback)
//
// All data fetched in parallel via TanStack Query. Optimistic refresh
// on focus so the user always sees fresh state when returning to the
// tab.

import { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import {
  ArrowRight,
  Building2,
  Calendar,
  Camera,
  CheckCircle,
  Clock,
  ClipboardList,
  MapPin,
  MessageCircle,
  Mic,
  Music,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { SafeScreen, Card, ProgressBar } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi } from "../../../lib/api";
import { API_PATHS } from "@epetrecere/shared/api";
import {
  eventTypeLabel,
  formatDateRO,
  relativeTimeRO,
  normalizeDiacritics,
} from "@epetrecere/shared/utils";

interface PlanSummary {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCountTarget: number | null;
  venueNeeded: boolean;
  checklistEnabled: boolean;
  budgetEnabled: boolean;
  guestsEnabled: boolean;
  momentsEnabled: boolean;
}

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

interface Conversation {
  id: number;
  vendorName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  clientUnread: number;
}

interface ChecklistItem {
  id: number;
  title: string;
  done: boolean;
}

interface Guest {
  id: number;
  rsvp: "pending" | "accepted" | "declined" | "maybe";
  partySize: number;
}

// Service tiles — same matchers as the web cabinet so the two views
// agree on what counts as "music", "photo", etc.
const SERVICE_BUCKETS = [
  {
    key: "venue",
    label: "Sală",
    Icon: Building2 as LucideIcon,
    matches: () => false, // venue handled separately
  },
  {
    key: "music",
    label: "Muzică",
    Icon: Music as LucideIcon,
    matches: (names: string[]) =>
      names.some((n) =>
        ["dj", "cantaret", "formati", "instrumental", "cvartet", "muzic"].some(
          (kw) => n.includes(kw),
        ),
      ),
  },
  {
    key: "photo",
    label: "Foto/Video",
    Icon: Camera as LucideIcon,
    matches: (names: string[]) =>
      names.some((n) =>
        ["fotograf", "videograf", "foto-video", "video"].some((kw) => n.includes(kw)),
      ),
  },
  {
    key: "moderator",
    label: "Moderator",
    Icon: Mic as LucideIcon,
    matches: (names: string[]) =>
      names.some((n) => n.includes("moderator")),
  },
  {
    key: "decor",
    label: "Decor",
    Icon: Sparkles as LucideIcon,
    matches: (names: string[]) =>
      names.some((n) =>
        ["decor", "floristic", "flori"].some((kw) => n.includes(kw)),
      ),
  },
] as const;

type ServiceStatus = "confirmed" | "pending" | "missing";

// The in-app budget calculator (/(client)/budget-calculator) is now a real
// screen (target + per-category estimate + progress, persisted locally),
// so the "Buget" card is a live CTA.
const BUDGET_CALCULATOR_READY = true;

export default function CabinetScreen() {
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const api = useApi();

  // 1. Active plans
  const plansQuery = useQuery({
    queryKey: ["my", "event-plans", "active"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const res = await api.get<{ plans: PlanSummary[] }>(API_PATHS.eventPlans, {
        query: { status: "active" },
      });
      return res.data?.plans ?? [];
    },
  });
  const activePlan = plansQuery.data?.[0] ?? null;

  // 2. Bookings + conversations
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

  const conversationsQuery = useQuery({
    queryKey: ["my", "conversations"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const res = await api.get<Conversation[]>(API_PATHS.conversations);
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  // 3. Plan detail (checklist + guests) — only when we have an active plan
  const planDetailQuery = useQuery({
    queryKey: ["my", "event-plan-detail", activePlan?.id],
    enabled: !!activePlan,
    queryFn: async () => {
      const res = await api.get<{
        checklist?: ChecklistItem[];
        guests?: Guest[];
      }>(API_PATHS.eventPlan(activePlan!.id));
      return res.data ?? {};
    },
  });

  // Derive everything
  const planBookings = useMemo(() => {
    if (!activePlan) return [] as BookingRequest[];
    return (bookingsQuery.data ?? []).filter(
      (b) =>
        b.eventPlanId === activePlan.id ||
        (b.eventPlanId == null &&
          activePlan.eventDate &&
          b.eventDate === activePlan.eventDate),
    );
  }, [bookingsQuery.data, activePlan]);

  const services = useMemo(() => {
    if (!activePlan) return [];
    const tiles: Array<{
      key: string;
      label: string;
      Icon: LucideIcon;
      status: ServiceStatus;
    }> = [];
    for (const bucket of SERVICE_BUCKETS) {
      if (bucket.key === "venue") {
        if (!activePlan.venueNeeded) continue;
        const venueBookings = planBookings.filter((b) => b.venueId != null);
        tiles.push({
          key: "venue",
          label: "Sală",
          Icon: bucket.Icon,
          status: deriveStatus(venueBookings),
        });
        continue;
      }
      const matching = planBookings.filter((b) => {
        const names = (b.categoryNames ?? []).map(normalizeDiacritics);
        return b.artistId != null && bucket.matches(names);
      });
      tiles.push({
        key: bucket.key,
        label: bucket.label,
        Icon: bucket.Icon,
        status: deriveStatus(matching),
      });
    }
    return tiles;
  }, [activePlan, planBookings]);

  const pendingBookings = planBookings.filter((b) => b.status === "pending").length;
  const unreadMessages = (conversationsQuery.data ?? []).reduce(
    (sum, c) => sum + (c.clientUnread ?? 0),
    0,
  );
  const rsvpYes = (planDetailQuery.data?.guests ?? [])
    .filter((g) => g.rsvp === "accepted")
    .reduce((s, g) => s + (g.partySize || 1), 0);

  const progressPct = useMemo(() => {
    if (!activePlan) return 0;
    const list = planDetailQuery.data?.checklist ?? [];
    if (activePlan.checklistEnabled && list.length > 0) {
      const done = list.filter((i) => i.done).length;
      return Math.round((done / list.length) * 100);
    }
    if (services.length === 0) return 0;
    const filled = services.filter((s) => s.status !== "missing").length;
    return Math.round((filled / services.length) * 100);
  }, [activePlan, planDetailQuery.data, services]);

  if (!isSignedIn || plansQuery.isLoading) {
    return (
      <SafeScreen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.gold} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen padded scroll>
      {/* Welcome */}
      <View className="pt-2">
        <Text className="font-heading text-[28px] font-bold leading-tight text-foreground">
          Bun venit, {user?.firstName ?? "utilizator"}!
        </Text>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Administrează evenimentul tău dintr-un singur loc.
        </Text>
      </View>

      {!activePlan ? (
        <EmptyState onPress={() => router.push("/(client)/planning")} />
      ) : (
        <>
          <HeroCard
            plan={activePlan}
            progressPct={progressPct}
            progressLabel={
              activePlan.checklistEnabled &&
              (planDetailQuery.data?.checklist?.length ?? 0) > 0
                ? "Organizare"
                : "Servicii confirmate"
            }
            progressSuffix={
              activePlan.checklistEnabled &&
              (planDetailQuery.data?.checklist?.length ?? 0) > 0
                ? "completă"
                : ""
            }
            onPressOpen={() =>
              router.push(`/(client)/plan/${activePlan.id}`)
            }
          />

          <NextStepCard
            plan={activePlan}
            services={services}
            checklist={planDetailQuery.data?.checklist ?? []}
          />

          <StatTilesRow
            plan={activePlan}
            rsvpYes={rsvpYes}
            pendingBookings={pendingBookings}
            unreadMessages={unreadMessages}
          />

          {services.length > 0 && (
            <ServicesStrip planId={activePlan.id} services={services} />
          )}

          <BottomRow
            plan={activePlan}
            conversations={conversationsQuery.data ?? []}
          />
        </>
      )}
    </SafeScreen>
  );
}

// ─── Sub-components ────────────────────────────────────────

function EmptyState({ onPress }: { onPress: () => void }) {
  return (
    <Card className="items-center gap-3 p-8">
      <Calendar size={40} color={colors.gold} opacity={0.4} />
      <Text className="font-heading text-[18px] font-bold text-foreground">
        Nu ai încă un eveniment activ
      </Text>
      <Text className="text-center text-[13px] text-muted-foreground">
        Pornește planificarea în 7 pași — îți pregătim panoul complet.
      </Text>
      <Pressable
        onPress={onPress}
        className="flex-row items-center gap-2 rounded-lg bg-gold px-5 py-2.5"
      >
        <Sparkles size={16} color={colors.background} />
        <Text className="text-[14px] font-semibold text-background">
          Începe să planifici
        </Text>
      </Pressable>
    </Card>
  );
}

function HeroCard({
  plan,
  progressPct,
  progressLabel,
  progressSuffix,
  onPressOpen,
}: {
  plan: PlanSummary;
  progressPct: number;
  progressLabel: string;
  progressSuffix: string;
  onPressOpen: () => void;
}) {
  const eventLabel = eventTypeLabel(plan.eventType);
  const dateLabel = plan.eventDate ? formatDateRO(plan.eventDate) : null;

  return (
    <Card className="gap-4 border-gold/30 p-5">
      <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-gold">
        Evenimentul tău activ
      </Text>

      <View className="flex-row gap-4">
        <View className="flex-1 gap-2">
          <Text className="font-heading text-[22px] font-bold leading-tight text-foreground">
            <Text className="text-foreground/70">{eventLabel} · </Text>
            {plan.title}
          </Text>

          {dateLabel && <MetaRow Icon={Calendar} label={dateLabel} />}
          {plan.location && <MetaRow Icon={MapPin} label={plan.location} />}
          {plan.guestsEnabled && plan.guestCountTarget != null && (
            <MetaRow Icon={Users} label={`${plan.guestCountTarget} invitați`} />
          )}
        </View>

        <Pressable onPress={onPressOpen}>
          <View className="aspect-[4/3] w-32 overflow-hidden rounded-xl border border-border">
            <Image
              source={{ uri: "/images/backgrounds/party-dance.jpg" }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
            />
            <View className="absolute bottom-2 right-2 h-8 w-8 items-center justify-center rounded-full bg-black/60">
              <ArrowRight size={16} color="#fff" />
            </View>
          </View>
        </Pressable>
      </View>

      {/* Progress + CTA */}
      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-[13px] text-foreground">
            {progressLabel}{" "}
            <Text className="text-gold">{progressPct}%</Text>
            {progressSuffix && (
              <Text className="text-foreground"> {progressSuffix}</Text>
            )}
          </Text>
        </View>
        <ProgressBar value={progressPct} />
        <Pressable
          onPress={onPressOpen}
          className="flex-row items-center justify-center gap-2 rounded-lg border border-gold/40 py-2.5"
        >
          <Text className="text-[13px] font-medium text-gold">
            Vezi planul meu
          </Text>
          <ArrowRight size={14} color={colors.gold} />
        </Pressable>
      </View>
    </Card>
  );
}

function MetaRow({ Icon, label }: { Icon: LucideIcon; label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon size={14} color={colors.gold} opacity={0.8} />
      <Text className="flex-1 text-[13px] text-foreground/85" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function NextStepCard({
  plan,
  services,
  checklist,
}: {
  plan: PlanSummary;
  services: Array<{ key: string; label: string; status: ServiceStatus }>;
  checklist: ChecklistItem[];
}) {
  const missingTile = services.find((s) => s.status === "missing");
  const nextChecklistItem = checklist.find((i) => !i.done);

  const step = (() => {
    if (missingTile) {
      return {
        title: `Alege ${missingTile.label.toLowerCase()} pentru eveniment`,
        subtitle: "Adaugă următorul partener pentru evenimentul tău.",
      };
    }
    if (plan.checklistEnabled && nextChecklistItem) {
      return {
        title: nextChecklistItem.title,
        subtitle: "Bifează când e gata — următoarea sarcină din checklist.",
      };
    }
    if (plan.momentsEnabled) {
      return {
        title: "Pregătește galeria foto cu QR",
        subtitle:
          "Imprimă QR-ul și pune-l pe mese ca invitații să încarce poze live.",
      };
    }
    return null;
  })();

  if (!step) return null;

  return (
    <Card className="flex-row items-center gap-3 p-4">
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-gold/15">
        <ClipboardList size={20} color={colors.gold} />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Următorul pas
        </Text>
        <Text className="mt-0.5 font-heading text-[15px] font-bold leading-tight text-foreground">
          {step.title}
        </Text>
        <Text className="mt-1 text-[11px] text-muted-foreground">
          {step.subtitle}
        </Text>
      </View>
    </Card>
  );
}

function StatTilesRow({
  plan,
  rsvpYes,
  pendingBookings,
  unreadMessages,
}: {
  plan: PlanSummary;
  rsvpYes: number;
  pendingBookings: number;
  unreadMessages: number;
}) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {plan.guestsEnabled && plan.guestCountTarget != null && (
        <StatTileMini
          Icon={CheckCircle}
          tint={colors.success}
          big={rsvpYes}
          label="confirmate"
          extra={`din ${plan.guestCountTarget} invitați`}
        />
      )}
      <StatTileMini
        Icon={Clock}
        tint={colors.gold}
        big={pendingBookings}
        label="în așteptare"
        extra="răspunsuri"
      />
      <StatTileMini
        Icon={MessageCircle}
        tint={colors.indigo}
        big={unreadMessages}
        label={unreadMessages === 1 ? "mesaj nou" : "mesaje noi"}
        extra="de la furnizori"
      />
    </View>
  );
}

function StatTileMini({
  Icon,
  tint,
  big,
  label,
  extra,
}: {
  Icon: LucideIcon;
  tint: string;
  big: number;
  label: string;
  extra: string;
}) {
  return (
    <Card className="min-w-[31%] flex-1 flex-row items-center gap-3 p-3">
      <View
        style={{ backgroundColor: tint + "26" }}
        className="h-10 w-10 items-center justify-center rounded-full"
      >
        <Icon size={18} color={tint} />
      </View>
      <View className="flex-1">
        <Text className="font-heading text-[20px] font-bold text-foreground">
          {big}
        </Text>
        <Text className="text-[11px] text-muted-foreground" numberOfLines={2}>
          <Text className="text-foreground/80">{label}</Text> {extra}
        </Text>
      </View>
    </Card>
  );
}

function ServicesStrip({
  planId,
  services,
}: {
  planId: number;
  services: Array<{
    key: string;
    label: string;
    Icon: LucideIcon;
    status: ServiceStatus;
  }>;
}) {
  const router = useRouter();
  return (
    <Card className="p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-heading text-[15px] font-bold text-foreground">
          Servicii pentru eveniment
        </Text>
        <Pressable
          hitSlop={8}
          onPress={() =>
            router.push({
              pathname: "/(client)/plan/[id]",
              params: { id: planId, tab: "bookings" },
            })
          }
        >
          <Text className="text-[12px] text-gold">Vezi toate</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {services.map((s) => (
          <ServiceTile key={s.key} service={s} />
        ))}
      </ScrollView>
    </Card>
  );
}

function ServiceTile({
  service,
}: {
  service: { key: string; label: string; Icon: LucideIcon; status: ServiceStatus };
}) {
  const statusCfg = {
    confirmed: {
      label: "Confirmat",
      bg: "bg-emerald-500/15",
      text: "text-emerald-400",
    },
    pending: {
      label: "În așteptare",
      bg: "bg-gold/15",
      text: "text-gold",
    },
    missing: {
      label: "De ales",
      bg: "bg-muted",
      text: "text-muted-foreground",
    },
  }[service.status];

  return (
    <View className="w-[100px] items-center gap-1.5 rounded-xl border border-border bg-background/40 p-3">
      <View className={`h-10 w-10 items-center justify-center rounded-lg ${statusCfg.bg}`}>
        <service.Icon
          size={18}
          color={
            service.status === "confirmed"
              ? colors.success
              : service.status === "pending"
                ? colors.gold
                : colors.mutedForeground
          }
        />
      </View>
      <Text className="text-[12px] font-medium text-foreground">{service.label}</Text>
      <Text className={`text-[10px] font-medium ${statusCfg.text}`}>
        {statusCfg.label}
      </Text>
    </View>
  );
}

function BottomRow({
  plan,
  conversations,
}: {
  plan: PlanSummary;
  conversations: Conversation[];
}) {
  const router = useRouter();
  const recent = conversations.slice(0, 3);

  return (
    <View className="gap-4">
      {/* Recent messages */}
      <Card className="gap-2 p-4">
        <Text className="font-heading text-[15px] font-bold text-foreground">
          Mesaje recente
        </Text>
        {recent.length === 0 ? (
          <Text className="text-[12px] text-muted-foreground">
            Nu ai mesaje încă. Deschide o conversație din pagina unui partener.
          </Text>
        ) : (
          recent.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/(client)/chat/${c.id}`)}
              className="flex-row items-center gap-3 rounded-xl py-2 active:bg-gold/5"
            >
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-gold/15">
                <Text className="text-[12px] font-bold text-gold">
                  {(c.vendorName ?? "??").slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text
                    className="flex-1 text-[14px] font-medium text-foreground"
                    numberOfLines={1}
                  >
                    {c.vendorName ?? "Furnizor"}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {relativeTimeRO(c.lastMessageAt)}
                  </Text>
                </View>
                <Text className="text-[12px] text-muted-foreground" numberOfLines={1}>
                  {c.lastMessagePreview ?? "—"}
                </Text>
              </View>
              {c.clientUnread > 0 && (
                <View className="h-2 w-2 rounded-full bg-gold" />
              )}
            </Pressable>
          ))
        )}
        <Pressable
          onPress={() => router.push("/(client)/chat-list" as never)}
          className="flex-row items-center gap-1"
        >
          <Text className="text-[12px] text-gold">Vezi toate mesajele</Text>
          <ArrowRight size={12} color={colors.gold} />
        </Pressable>
      </Card>

      {/* Buget OR Photo Moments OR Recenzii fallback */}
      {BUDGET_CALCULATOR_READY && plan.budgetEnabled && (
        <FeatureCard
          Icon={Wallet}
          title="Buget"
          description="Calculator de buget pentru evenimentul tău."
          onPress={() => router.push("/(client)/budget-calculator" as never)}
        />
      )}
      {plan.momentsEnabled && (
        <FeatureCard
          Icon={Camera}
          title="Photo Moments"
          description="Galerie live cu QR pentru invitați."
          onPress={() => router.push(`/(client)/moments/${plan.id}` as never)}
        />
      )}
    </View>
  );
}

function FeatureCard({
  Icon,
  title,
  description,
  onPress,
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} className="flex-row items-center gap-3 p-4">
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-gold/15">
        <Icon size={20} color={colors.gold} />
      </View>
      <View className="flex-1">
        <Text className="font-heading text-[15px] font-bold text-foreground">
          {title}
        </Text>
        <Text className="text-[12px] text-muted-foreground">{description}</Text>
      </View>
      <ArrowRight size={16} color={colors.mutedForeground} />
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────

function deriveStatus(bookings: BookingRequest[]): ServiceStatus {
  if (
    bookings.some(
      (b) => b.status === "accepted" || b.status === "confirmed_by_client",
    )
  ) {
    return "confirmed";
  }
  if (bookings.some((b) => b.status === "pending")) return "pending";
  return "missing";
}
