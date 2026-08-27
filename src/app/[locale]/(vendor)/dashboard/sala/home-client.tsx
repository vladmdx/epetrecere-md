"use client";

// Home dashboard for the venue — KPI cards + mini calendar + activity feed
// + recent bookings table. Server wrapper passes pre-computed data.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  TrendingUp,
  TrendingDown,
  Star,
  Calendar as CalendarIcon,
  Inbox,
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Banknote,
  Users,
  ArrowRight,
  ExternalLink,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALL_EVENT_TYPES,
  eventTypeLabel,
  normalizeEventType,
} from "@/lib/events/normalize";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { VenueStats } from "@/lib/db/queries/venue-stats";
import { useLocale } from "@/hooks/use-locale";

/** The shape `useLocale().t` has — kept local so helpers can take it as an argument. */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

interface ActivityItem {
  id: number;
  type: string;
  title: string;
  message: string | null;
  actionUrl: string | null;
  createdAt: string;
  isRead: boolean;
}

interface RecentBooking {
  id: number;
  clientName: string;
  eventType: string | null;
  eventDate: string | null;
  guestCount: number | null;
  status: string;
  priceAgreed: number | null;
}

interface CalendarDay {
  date: string;
  status: string;
  eventType: string | null;
}

interface Props {
  venueName: string;
  venueSlug: string;
  stats: VenueStats;
  activity: ActivityItem[];
  recentBookings: RecentBooking[];
  monthCalendar: CalendarDay[];
  monthYear: number;
  monthIndex: number;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  wedding: "bg-red-500/80",
  proposal: "bg-fuchsia-500/80",
  nunta: "bg-red-500/80",
  cununie: "bg-rose-500/80",
  baptism: "bg-blue-500/80",
  botez: "bg-blue-500/80",
  cumatrie: "bg-cyan-500/80",
  corporate: "bg-purple-500/80",
  birthday: "bg-orange-500/80",
  aniversare: "bg-orange-500/80",
  kids_birthday: "bg-amber-500/80",
  concert: "bg-violet-500/80",
  other: "bg-slate-500/80",
};

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500/30 border-emerald-500/50",
  booked: "bg-red-500/30 border-red-500/50",
  tentative: "bg-yellow-500/30 border-yellow-500/50",
  blocked: "bg-slate-500/30 border-slate-500/50",
};

function formatRelativeTime(iso: string, t: Translate): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return t("notifications.justNow");
  if (diffMin < 60) return t("vendor.venueHome.minutesAgo", { count: diffMin });
  if (diffMin < 24 * 60) return t("vendor.venueHome.hoursAgo", { count: Math.floor(diffMin / 60) });
  const diffDays = Math.floor(diffMin / (24 * 60));
  if (diffDays === 1) return t("vendor.venueHome.yesterday");
  if (diffDays < 7) return t("vendor.venueHome.daysAgo", { count: diffDays });
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
  });
}

function activityIcon(type: string) {
  if (type.includes("review")) return { Icon: Star, color: "text-amber-400" };
  if (type.includes("message")) return { Icon: MessageSquare, color: "text-blue-400" };
  if (type.includes("payment") || type.includes("plata"))
    return { Icon: Banknote, color: "text-emerald-400" };
  if (type.includes("confirmed") || type.includes("approved"))
    return { Icon: CheckCircle2, color: "text-emerald-400" };
  return { Icon: Inbox, color: "text-gold" };
}

export function VenueHomeDashboard({
  venueName,
  venueSlug,
  stats,
  activity,
  recentBookings: initialBookings,
  monthCalendar,
  monthYear,
  monthIndex,
}: Props) {
  const router = useRouter();
  const { t } = useLocale();
  const [recentBookings, setRecentBookings] =
    useState<RecentBooking[]>(initialBookings);
  const [actioning, setActioning] = useState<number | null>(null);

  async function quickAccept(id: number) {
    setActioning(id);
    try {
      const res = await fetch(`/api/booking-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("vendor.venueHome.toastAcceptError"));
        return;
      }
      toast.success(t("vendor.venueHome.toastAccepted"));
      setRecentBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "accepted" } : b)),
      );
      router.refresh();
    } finally {
      setActioning(null);
    }
  }

  async function quickDecline(id: number) {
    if (!confirm(t("vendor.venueHome.confirmDecline"))) {
      return;
    }
    setActioning(id);
    try {
      const res = await fetch(`/api/booking-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decline",
          reply: t("vendor.venueHome.quickDeclineReply"),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("vendor.venueHome.toastDeclineError"));
        return;
      }
      toast.success(t("vendor.venueHome.toastDeclined"));
      setRecentBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "rejected" } : b)),
      );
      router.refresh();
    } finally {
      setActioning(null);
    }
  }

  const revenueDiff = stats.revenueThisMonth - stats.revenueLastMonth;
  const revenueDiffPct =
    stats.revenueLastMonth > 0
      ? Math.round((revenueDiff / stats.revenueLastMonth) * 100)
      : stats.revenueThisMonth > 0
        ? 100
        : 0;

  // Build calendar grid
  const firstDay = new Date(monthYear, monthIndex, 1);
  const lastDay = new Date(monthYear, monthIndex + 1, 0);
  const firstWeekday = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = lastDay.getDate();

  const calendarMap = new Map<string, CalendarDay>();
  for (const d of monthCalendar) {
    const dateStr = typeof d.date === "string" ? d.date.split("T")[0] : d.date;
    calendarMap.set(dateStr, { ...d, date: dateStr });
  }

  const cells: Array<{ day: number | null; data?: CalendarDay }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null });
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${monthYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, data: calendarMap.get(dateStr) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("vendor.dashboard")}</h1>
          <p className="text-muted-foreground">
            {t("vendor.venueHome.welcome")} <strong>{venueName}</strong>
          </p>
        </div>
        <Link
          href={`/sali/${venueSlug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground hover:border-gold/40 hover:text-gold"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("vendor.venueHome.viewPublicProfile")}
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("vendor.venueHome.kpiNewRequests")}
          value={stats.pendingBookings}
          icon={Bell}
          accentColor="text-gold"
          href="/dashboard/sala/rezervari?tab=noi"
        />

        <KpiCard
          label={t("vendor.venueHome.kpiOccupancy")}
          value={`${stats.occupancyRate}%`}
          subLabel={t("vendor.venueHome.occupancyDays", { busy: stats.occupancyBusyDays, total: stats.occupancyTotalDays })}
          icon={CalendarIcon}
          accentColor="text-blue-400"
          href="/dashboard/sala/calendar"
          progressPct={stats.occupancyRate}
        />

        <KpiCard
          label={t("vendor.venueHome.kpiRevenue")}
          value={`${stats.revenueThisMonth.toLocaleString("ro-RO")}€`}
          subLabel={
            revenueDiffPct !== 0
              ? t("vendor.venueHome.vsLastMonth", { sign: revenueDiffPct > 0 ? "+" : "", pct: revenueDiffPct })
              : undefined
          }
          trendUp={revenueDiffPct > 0}
          trendDown={revenueDiffPct < 0}
          icon={Wallet}
          accentColor="text-emerald-400"
          href="/dashboard/sala/financiar"
        />

        <KpiCard
          label={t("vendor.venueHome.kpiRating")}
          value={
            stats.ratingCount === 0 || stats.ratingAvg === null
              ? "—"
              : stats.ratingAvg.toFixed(1)
          }
          subLabel={
            stats.ratingCount > 0
              ? t("vendor.venueHome.reviewCount", { count: stats.ratingCount })
              : t("vendor.venueHome.none")
          }
          icon={Star}
          accentColor="text-amber-400"
          href="/dashboard/sala/recenzii"
          showStars={stats.ratingAvg ?? undefined}
        />
      </div>

      {/* Mini calendar + activity feed */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Mini calendar */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold">
                {t(`vendor.venueHome.month${monthIndex + 1}`)} {monthYear}
              </h2>
              <Link
                href="/dashboard/sala/calendar"
                className="text-xs text-gold hover:underline"
              >
                {t("vendor.venueHome.fullCalendar")}
              </Link>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <div key={d} className="pb-2">{t(`vendor.venueHome.weekday${d}`)}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c, i) => {
                if (c.day === null) return <div key={i} />;
                const dateStr = `${monthYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
                const isToday = dateStr === todayStr;
                const statusColor = c.data?.status
                  ? STATUS_COLORS[c.data.status] || ""
                  : "";
                const eventColor = c.data?.eventType
                  ? EVENT_TYPE_COLORS[c.data.eventType.toLowerCase()] || ""
                  : "";
                return (
                  <Link
                    key={i}
                    href={`/dashboard/sala/calendar?date=${dateStr}`}
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-md border border-transparent text-xs transition-all hover:border-gold/40 hover:bg-gold/5",
                      statusColor,
                      isToday && "ring-2 ring-gold",
                    )}
                  >
                    {c.day}
                    {eventColor && (
                      <span
                        className={cn(
                          "absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                          eventColor,
                        )}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
            {/* Legend — status colors (cell background) + event-type dots */}
            <div className="mt-4 space-y-2 border-t border-border/30 pt-3 text-[10px] text-muted-foreground">
              <div className="flex flex-wrap gap-3">
                <LegendDot color="bg-emerald-500/50" label={t("common.available")} />
                <LegendDot color="bg-red-500/50" label={t("vendor.venueHome.reserved")} />
                <LegendDot color="bg-yellow-500/50" label={t("common.tentative")} />
                <LegendDot color="bg-slate-500/50" label={t("common.blocked")} />
              </div>
              {/* Built from the same colour map the calendar dots use, so the
                  legend cannot fall out of step with what is drawn — it used
                  to list four hand-written entries with their own colours. */}
              <div className="flex flex-wrap gap-3 text-[9px]">
                {ALL_EVENT_TYPES.map((k) => (
                  <LegendDot
                    key={k}
                    color={EVENT_TYPE_COLORS[k] ?? "bg-slate-500/80"}
                    label={eventTypeLabel(k)}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity feed */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold">
                {t("vendor.venueHome.recentActivity")}
              </h2>
              {activity.filter((a) => !a.isRead).length > 0 && (
                <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-medium text-gold">
                  {t("vendor.venueHome.newCount", { count: activity.filter((a) => !a.isRead).length })}
                </span>
              )}
            </div>
            {activity.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("vendor.venueHome.noActivity")}
              </p>
            ) : (
              <ul className="max-h-[320px] space-y-2 overflow-y-auto">
                {activity.map((item) => {
                  const { Icon, color } = activityIcon(item.type);
                  const content = (
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-lg p-2 transition-colors",
                        !item.isRead && "bg-gold/5",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/50",
                          color,
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {item.message && (
                          <p className="truncate text-xs text-muted-foreground">
                            {item.message}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                          {formatRelativeTime(item.createdAt, t)}
                        </p>
                      </div>
                    </div>
                  );
                  return (
                    <li key={item.id}>
                      {item.actionUrl ? (
                        <Link
                          href={item.actionUrl}
                          className="block hover:bg-accent/30"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent bookings */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">
              {t("vendor.venueHome.latestRequests")}
            </h2>
            <Link
              href="/dashboard/sala/rezervari"
              className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
            >
              {t("common.viewAll")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recentBookings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/40 py-12 text-center">
              <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">{t("vendor.venueHome.noBookings")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("vendor.venueHome.noBookingsHint")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-3">{t("vendor.venueHome.colClient")}</th>
                    <th className="pb-2 pr-3">{t("vendor.venueHome.colEvent")}</th>
                    <th className="pb-2 pr-3">{t("vendor.venueHome.colDate")}</th>
                    <th className="pb-2 pr-3">{t("vendor.venueHome.colGuests")}</th>
                    <th className="pb-2 pr-3">{t("vendor.venueHome.colStatus")}</th>
                    <th className="pb-2 pr-3 text-right">{t("vendor.venueHome.colPrice")}</th>
                    <th className="pb-2 text-right">{t("vendor.venueHome.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b) => {
                    const isPending = b.status === "pending";
                    const isActioning = actioning === b.id;
                    return (
                      <tr
                        key={b.id}
                        className="border-b border-border/20 last:border-0 hover:bg-accent/30"
                      >
                        <td className="py-3 pr-3 font-medium">{b.clientName}</td>
                        <td className="py-3 pr-3 text-muted-foreground">
                          {b.eventType
                            ? eventTypeLabel(normalizeEventType(b.eventType))
                            : "—"}
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">
                          {b.eventDate
                            ? new Date(b.eventDate).toLocaleDateString("ro-RO", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">
                          {b.guestCount ? (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {b.guestCount}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="py-3 pr-3 text-right font-medium">
                          {b.priceAgreed ? `${b.priceAgreed}€` : "—"}
                        </td>
                        <td className="py-3 text-right">
                          {isPending ? (
                            <div className="inline-flex gap-1">
                              <Button
                                size="icon-sm"
                                aria-label={t("vendor.venueHome.accept")}
                                disabled={isActioning}
                                onClick={() => quickAccept(b.id)}
                                className="h-7 w-7 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                              >
                                {isActioning ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                size="icon-sm"
                                aria-label={t("vendor.venueHome.reject")}
                                variant="ghost"
                                disabled={isActioning}
                                onClick={() => quickDecline(b.id)}
                                className="h-7 w-7 text-red-400 hover:bg-red-500/15"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Link
                              href="/dashboard/sala/rezervari"
                              className="text-xs text-muted-foreground hover:text-gold"
                            >
                              {t("vendor.venueHome.viewArrow")}
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subLabel,
  icon: Icon,
  accentColor,
  href,
  progressPct,
  trendUp,
  trendDown,
  showStars,
}: {
  label: string;
  value: string | number;
  subLabel?: string;
  icon: typeof Bell;
  accentColor: string;
  href: string;
  progressPct?: number;
  trendUp?: boolean;
  trendDown?: boolean;
  showStars?: number;
}) {
  return (
    <Link href={href} className="group">
      <Card className="transition-all hover:border-gold/40 hover:shadow-lg hover:shadow-gold/10 hover:-translate-y-0.5">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={cn("font-heading text-3xl font-bold", accentColor)}>
                  {value}
                </span>
                {trendUp && <TrendingUp className="h-4 w-4 text-emerald-400" />}
                {trendDown && <TrendingDown className="h-4 w-4 text-red-400" />}
              </div>
              {subLabel && (
                <p
                  className={cn(
                    "mt-1 text-xs",
                    trendUp && "text-emerald-400",
                    trendDown && "text-red-400",
                    !trendUp && !trendDown && "text-muted-foreground",
                  )}
                >
                  {subLabel}
                </p>
              )}
              {showStars !== undefined && (
                <div className="mt-1 flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={cn(
                        "h-3 w-3",
                        i <= Math.round(showStars)
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/30",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/40 transition-colors group-hover:bg-gold/10",
                accentColor,
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          </div>
          {progressPct !== undefined && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLocale();
  const cfg: Record<string, { labelKey: string; className: string; icon: typeof CheckCircle2 }> = {
    pending: {
      labelKey: "vendor.venueHome.statusPending",
      className: "bg-yellow-500/15 text-yellow-400",
      icon: Clock,
    },
    confirmed: {
      labelKey: "vendor.venueHome.statusConfirmed",
      className: "bg-emerald-500/15 text-emerald-400",
      icon: CheckCircle2,
    },
    accepted: {
      labelKey: "vendor.venueHome.statusAccepted",
      className: "bg-emerald-500/15 text-emerald-400",
      icon: CheckCircle2,
    },
    declined: {
      labelKey: "vendor.venueHome.statusDeclined",
      className: "bg-red-500/15 text-red-400",
      icon: XCircle,
    },
    cancelled: {
      labelKey: "vendor.venueHome.statusCancelled",
      className: "bg-red-500/15 text-red-400",
      icon: XCircle,
    },
    completed: {
      labelKey: "vendor.venueHome.statusCompleted",
      className: "bg-blue-500/15 text-blue-400",
      icon: CheckCircle2,
    },
  };
  const c = cfg[status] || cfg.pending;
  const Icon = c.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
        c.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {t(c.labelKey)}
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {label}
    </span>
  );
}
