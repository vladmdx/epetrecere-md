// Partner dashboard home — mobile twin of the web partner dashboard.
//
// Layout (top to bottom):
//   1. Welcome header (Panoul Meu + subtitle)
//   2. Hero card with artist logo/initials, plan tier, profile
//      completion bar, "Completează profilul" CTA
//   3. 4 stat tiles with delta sub-labels (cereri/confirmate/mesaje/venit)
//   4. Următorul eveniment card with cover image + meta + open + chat
//   5. Cereri recente list (3 max) with status pills
//   6. 3 bottom shortcuts (Calendar / Tarife / Financiar)
//   7. Footer flourish

import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { Image } from "expo-image";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  MapPin,
  MessageSquare,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { SafeScreen,
  Card,
  ProgressBar,
  StatTile,
  Badge,
  Button,
  type BadgeTone, ErrorState } from "../../../components/ui";
import { colors } from "../../../constants/theme";
import { useApi, unwrap, ApiError} from "../../../lib/api";
import { initials } from "@epetrecere/shared/utils";

interface DashboardResponse {
  profile: {
    id: number;
    nameRo: string;
    slug: string;
    photoUrl: string | null;
    isPremium: boolean;
    isVerified: boolean;
    profileCompletionPct: number;
  } | null;
  stats: {
    pendingRequests: number;
    pendingRequestsCreatedToday: number;
    pendingRequestsCreatedYesterday: number;
    confirmedThisMonth: number;
    confirmedThisWeek: number;
    confirmedLastWeek: number;
    unreadMessages: number;
    unreadMessagesToday: number;
    unreadMessagesYesterday: number;
    revenueThisMonthEUR: number;
    revenueLastMonthEUR: number;
  };
  nextEvent: {
    id: number;
    eventType: string | null;
    clientName: string;
    eventDate: string;
    startTime: string | null;
    location: string | null;
    guestCount: number | null;
    venueName: string | null;
    venueImage: string | null;
    status: string;
  } | null;
  recentRequests: Array<{
    id: number;
    eventType: string | null;
    clientName: string;
    eventDate: string;
    location: string | null;
    guestCount: number | null;
    status: string;
    createdAt: string;
  }>;
}

const WEEKDAYS_RO = [
  "Duminică",
  "Luni",
  "Marți",
  "Miercuri",
  "Joi",
  "Vineri",
  "Sâmbătă",
] as const;
const MONTHS_RO = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
] as const;
const MONTHS_RO_SHORT = [
  "ian.",
  "feb.",
  "mar.",
  "apr.",
  "mai",
  "iun.",
  "iul.",
  "aug.",
  "sep.",
  "oct.",
  "noi.",
  "dec.",
] as const;
const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  corporate: "Corporate",
  birthday: "Aniversare",
  concert: "Concert",
  other: "Eveniment",
};

export default function PartnerDashboardScreen() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const api = useApi();

  const dashQuery = useQuery({
    queryKey: ["partner-dashboard"],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const res = await api.get<DashboardResponse>("/me/artist/dashboard");
      // A partner who has picked the artist role but not yet built a profile
      // gets 404 `no_artist_profile` here. That is not a failure — it is the
      // ordinary first state, and the screen below already knows how to render
      // it. Treating it as an error left every new partner staring at a
      // spinner with no way forward, which is where they all stopped.
      if (res.status === 404) return { profile: null } as DashboardResponse;
      return unwrap(res);
    },
    retry: (count, err) =>
      err instanceof ApiError && (err.status === 404 || err.isAuth)
        ? false
        : count < 2,
  });

  if (dashQuery.isLoading) {
    return (
      <SafeScreen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.gold} />
        </View>
      </SafeScreen>
    );
  }

  // A failed read used to land here too, and this guard never reopened —
  // the query resolved with data:null, so isLoading went false while the
  // condition stayed true. Now failure has its own branch and a way out.
  if (dashQuery.isError || !dashQuery.data) {
    return (
      <ErrorState
        error={dashQuery.error}
        onRetry={() => dashQuery.refetch()}
        retrying={dashQuery.isFetching}
      />
    );
  }

  if (!dashQuery.data.profile) {
    // Pending onboarding shell
    return (
      <SafeScreen padded>
        <View className="pt-2">
          <Text className="font-heading text-[28px] font-bold text-foreground">
            Panoul Meu
          </Text>
          <Text className="mt-1 text-[13px] text-muted-foreground">
            Completează profilul pentru a fi vizibil pe site.
          </Text>
        </View>
        <Card className="mt-4 gap-3 border-gold/40 bg-gold/5 p-5">
          <View className="flex-row items-center gap-3">
            <Sparkles size={24} color={colors.gold} />
            <View className="flex-1">
              <Text className="font-heading text-[16px] font-bold text-foreground">
                Profilul tău nu este încă creat
              </Text>
              <Text className="mt-0.5 text-[12px] text-muted-foreground">
                Completează onboarding-ul ca să primești cereri.
              </Text>
            </View>
          </View>
          <Button onPress={() => router.push("/(partner)/profile/edit")} fullWidth size="md">
            Completează profilul
          </Button>
        </Card>
      </SafeScreen>
    );
  }

  const { profile, stats, nextEvent, recentRequests } = dashQuery.data;

  // Deltas formatted like the web
  const pendingDelta =
    stats.pendingRequestsCreatedToday - stats.pendingRequestsCreatedYesterday;
  const confirmedDelta = stats.confirmedThisWeek - stats.confirmedLastWeek;
  const messagesDelta = stats.unreadMessagesToday - stats.unreadMessagesYesterday;
  const revenuePctDelta = (() => {
    if (stats.revenueLastMonthEUR <= 0) {
      return stats.revenueThisMonthEUR > 0 ? 100 : 0;
    }
    return Math.round(
      ((stats.revenueThisMonthEUR - stats.revenueLastMonthEUR) /
        stats.revenueLastMonthEUR) *
        100,
    );
  })();

  return (
    <SafeScreen padded scroll>
      {/* Welcome header */}
      <View className="pt-2">
        <Text className="font-heading text-[28px] font-bold text-foreground">
          Panoul Meu
        </Text>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Gestionează cererile, calendarul și veniturile dintr-un singur loc.
        </Text>
      </View>

      {/* Hero card */}
      <HeroCard
        profile={profile}
        onPressCta={() => router.push("/(partner)/profile/edit")}
      />

      {/* Stat tiles */}
      <View className="flex-row flex-wrap gap-3">
        <StatTile
          Icon={BookOpen}
          tint="indigo"
          big={stats.pendingRequests}
          label="Cereri noi"
          deltaLabel={deltaLabel(pendingDelta, "ieri")}
          deltaPositive={pendingDelta >= 0}
          onPress={() => router.push("/(partner)/(tabs)/bookings")}
        />
        <StatTile
          Icon={CheckCircle2}
          tint="success"
          big={stats.confirmedThisMonth}
          label="Evenimente confirmate"
          deltaLabel={deltaLabel(confirmedDelta, "săpt. trecută")}
          deltaPositive={confirmedDelta >= 0}
          onPress={() => router.push("/(partner)/(tabs)/bookings?status=confirmed" as never)}
        />
        <StatTile
          Icon={MessageSquare}
          tint="info"
          big={stats.unreadMessages}
          label="Mesaje noi"
          deltaLabel={deltaLabel(messagesDelta, "ieri")}
          deltaPositive={messagesDelta >= 0}
          onPress={() => router.push("/(partner)/(tabs)/messages")}
        />
        <StatTile
          Icon={DollarSign}
          tint="gold"
          big={formatMoney(stats.revenueThisMonthEUR)}
          label="Venit luna"
          deltaLabel={`${revenuePctDelta >= 0 ? "+" : ""}${revenuePctDelta}% față de luna trecută`}
          deltaPositive={revenuePctDelta >= 0}
          onPress={() => router.push("/(partner)/financiar" as never)}
        />
      </View>

      {/* Next event card */}
      {nextEvent && <NextEventCard event={nextEvent} />}

      {/* Recent requests */}
      <RecentRequests
        items={recentRequests}
        onSeeAll={() => router.push("/(partner)/(tabs)/bookings")}
        onPressItem={(id) => router.push(`/(partner)/booking/${id}`)}
      />

      {/* Bottom shortcuts */}
      <View className="flex-row gap-3">
        <ShortcutTile
          Icon={CalendarDays}
          title="Calendar"
          description="Vezi programul"
          onPress={() => router.push("/(partner)/(tabs)/calendar")}
        />
        <ShortcutTile
          Icon={Clock}
          title="Tarife"
          description="Pachetele tale"
          onPress={() => router.push("/(partner)/profile/edit?section=tarife" as never)}
        />
        <ShortcutTile
          Icon={Wallet}
          title="Financiar"
          description="Venituri & plăți"
          onPress={() => router.push("/(partner)/financiar" as never)}
        />
      </View>

      {/* Footer */}
      <View className="flex-row items-center justify-center gap-2 pt-2">
        <Sparkles size={14} color={colors.gold} />
        <Text className="text-center text-[11px] text-muted-foreground">
          Succesul tău începe cu o organizare impecabilă.
        </Text>
      </View>
    </SafeScreen>
  );
}

// ─── Sub-components ──────────────────────────────────────

function HeroCard({
  profile,
  onPressCta,
}: {
  profile: NonNullable<DashboardResponse["profile"]>;
  onPressCta: () => void;
}) {
  const planLabel = profile.isPremium ? "Plan Premium" : "Plan Standard";

  return (
    <Card className="gap-4 border-gold/30 p-5">
      <View className="flex-row items-center gap-4">
        <View className="h-20 w-20 overflow-hidden rounded-2xl border-2 border-gold/40">
          {profile.photoUrl ? (
            <Image
              source={{ uri: profile.photoUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <View className="flex-1 items-center justify-center bg-card">
              <Text className="font-heading text-[22px] font-bold text-gold">
                {initials(profile.nameRo)}
              </Text>
            </View>
          )}
        </View>
        <View className="flex-1">
          <Text
            className="font-heading text-[20px] font-bold text-foreground"
            numberOfLines={1}
          >
            {profile.nameRo}
          </Text>
          <Text className="text-[13px] text-muted-foreground">{planLabel}</Text>
        </View>
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-[12px] text-foreground/80">Profil completat</Text>
          <Text className="text-[12px] font-semibold text-gold">
            {profile.profileCompletionPct}%
          </Text>
        </View>
        <ProgressBar value={profile.profileCompletionPct} />
      </View>

      <Button variant="outline" size="md" onPress={onPressCta} fullWidth>
        Completează profilul
      </Button>
    </Card>
  );
}

function NextEventCard({
  event,
}: {
  event: NonNullable<DashboardResponse["nextEvent"]>;
}) {
  const router = useRouter();
  const d = new Date(event.eventDate + "T00:00:00");
  const weekday = WEEKDAYS_RO[d.getDay()];
  const dateLabel = `${d.getDate()} ${MONTHS_RO[d.getMonth()]} ${d.getFullYear()}`;
  const headerDate = `${weekday}, ${dateLabel}`;
  const eventLabel = event.eventType
    ? EVENT_TYPE_LABELS[event.eventType] ?? "Eveniment"
    : "Eveniment";
  const image = event.venueImage || "/images/backgrounds/party-dance.jpg";

  return (
    <Card className="overflow-hidden p-0">
      {/* Header strip */}
      <View className="flex-row items-center justify-between gap-2 border-b border-border bg-gold/5 px-4 py-3">
        <View className="flex-row items-center gap-2">
          <CalendarDays size={16} color={colors.gold} />
          <Text className="font-heading text-[14px] font-bold text-foreground">
            Următorul eveniment
          </Text>
        </View>
        <View className="rounded-full bg-background/60 px-3 py-1">
          <Text className="text-[11px] text-muted-foreground">
            {headerDate}
          </Text>
        </View>
      </View>

      <View className="gap-3 p-4">
        <View className="aspect-[16/10] w-full overflow-hidden rounded-xl">
          <Image
            source={{ uri: image }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={200}
          />
        </View>

        <Text className="font-heading text-[18px] font-bold leading-tight text-foreground">
          <Text className="text-foreground/70">{eventLabel} — </Text>
          {event.clientName}
        </Text>

        <View className="gap-1.5">
          <MetaRow Icon={CalendarDays} label={dateLabel} />
          {event.startTime && <MetaRow Icon={Clock} label={event.startTime} />}
          {event.location && <MetaRow Icon={MapPin} label={event.location} />}
          {event.guestCount != null && (
            <MetaRow Icon={Users} label={`${event.guestCount} invitați`} />
          )}
        </View>

        <View className="flex-row gap-2 pt-1">
          <Button
            onPress={() => router.push(`/(partner)/booking/${event.id}`)}
            size="md"
            leftIcon={<Eye size={16} color={colors.background} />}
          >
            Deschide cererea
          </Button>
          <Button
            variant="outline"
            onPress={() => router.push(`/(partner)/(tabs)/messages` as never)}
            size="md"
            leftIcon={<MessageSquare size={16} color={colors.gold} />}
          >
            Mesaj client
          </Button>
        </View>
      </View>
    </Card>
  );
}

function MetaRow({ Icon, label }: { Icon: LucideIcon; label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon size={14} color={colors.gold} opacity={0.8} />
      <Text className="text-[13px] text-foreground/85">{label}</Text>
    </View>
  );
}

function RecentRequests({
  items,
  onSeeAll,
  onPressItem,
}: {
  items: DashboardResponse["recentRequests"];
  onSeeAll: () => void;
  onPressItem: (id: number) => void;
}) {
  return (
    <Card className="p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-heading text-[15px] font-bold text-foreground">
          Cereri recente
        </Text>
        <Pressable hitSlop={8} onPress={onSeeAll} className="flex-row items-center gap-1">
          <Text className="text-[12px] text-gold">Vezi toate</Text>
          <ArrowRight size={12} color={colors.gold} />
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Text className="py-4 text-center text-[12px] text-muted-foreground">
          Încă nu ai cereri. Profilul tău e online — clienții te pot găsi oricând.
        </Text>
      ) : (
        <View className="gap-2">
          {items.map((req) => (
            <RecentRequestRow
              key={req.id}
              req={req}
              onPress={() => onPressItem(req.id)}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

function RecentRequestRow({
  req,
  onPress,
}: {
  req: DashboardResponse["recentRequests"][number];
  onPress: () => void;
}) {
  const d = new Date(req.eventDate + "T00:00:00");
  const dateLabel = `${d.getDate()} ${MONTHS_RO_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  const eventLabel = req.eventType
    ? EVENT_TYPE_LABELS[req.eventType] ?? "Eveniment"
    : "Eveniment";
  const pill = statusPill(req.status);

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl border border-transparent p-2 active:border-gold/30 active:bg-gold/5"
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-xl ${pill.iconBg}`}
      >
        <BookOpen size={18} color={pill.iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-medium text-foreground" numberOfLines={1}>
          <Text className="text-foreground">{eventLabel}</Text>
          <Text className="text-foreground/60"> — {req.clientName}</Text>
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          <Text className="text-[11px] text-muted-foreground">{dateLabel}</Text>
          {req.location && (
            <Text className="text-[11px] text-muted-foreground">· {req.location}</Text>
          )}
          {req.guestCount != null && (
            <View className="flex-row items-center gap-1">
              <Users size={10} color={colors.mutedForeground} />
              <Text className="text-[11px] text-muted-foreground">
                {req.guestCount}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Badge tone={pill.tone} size="sm">
        {pill.label}
      </Badge>
      <ArrowRight size={14} color={colors.mutedForeground} />
    </Pressable>
  );
}

function ShortcutTile({
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
    <Card onPress={onPress} className="flex-1 gap-2 p-3">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-gold/15">
        <Icon size={18} color={colors.gold} />
      </View>
      <View>
        <Text
          className="font-heading text-[13px] font-bold text-foreground"
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
          {description}
        </Text>
      </View>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────

function deltaLabel(delta: number, vs: string): string {
  if (delta === 0) return `0 față de ${vs}`;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta)} față de ${vs}`;
}

function formatMoney(eur: number): string {
  if (eur < 1000) return `${eur} €`;
  const thousand = Math.floor(eur / 1000);
  const remainder = String(eur % 1000).padStart(3, "0");
  return `${thousand}.${remainder} €`;
}

function statusPill(status: string): {
  label: string;
  tone: BadgeTone;
  iconBg: string;
  iconColor: string;
} {
  switch (status) {
    case "pending":
      return {
        label: "Nou",
        tone: "indigo",
        iconBg: "bg-indigo-500/15",
        iconColor: colors.indigo,
      };
    case "accepted":
      return {
        label: "În așteptare",
        tone: "warning",
        iconBg: "bg-amber-500/15",
        iconColor: colors.warning,
      };
    case "confirmed_by_client":
    case "completed":
      return {
        label: "Confirmat",
        tone: "success",
        iconBg: "bg-emerald-500/15",
        iconColor: colors.success,
      };
    case "rejected":
    case "cancelled":
      return {
        label: "Refuzat",
        tone: "danger",
        iconBg: "bg-rose-500/15",
        iconColor: colors.danger,
      };
    default:
      return {
        label: status,
        tone: "default",
        iconBg: "bg-muted",
        iconColor: colors.mutedForeground,
      };
  }
}

