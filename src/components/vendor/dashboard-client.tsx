"use client";

// Partner dashboard — redesigned client UI.
//
// Hero card (premium plan + profile completion progress) → 4 stat tiles
// with WoW/MoM deltas → next upcoming event with cover image + actions →
// recent requests list with status pills → 3 bottom nav cards.
//
// Server passes ArtistStats + NextEvent + RecentRequest[] +
// ArtistProfileSnapshot, all live data, so the dashboard never lies on
// first paint. Animations are pure Tailwind transitions (hover lift +
// shadow, click scale-down, icon scale on hover) — same vocabulary used
// on the client cabinet so the two sides feel like one product.

import Link from "next/link";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtistStats } from "@/lib/db/queries/artist-stats";
import type {
  ArtistProfileSnapshot,
  NextEvent,
  RecentRequest,
} from "@/lib/db/queries/artist-dashboard";

interface Props {
  profile: ArtistProfileSnapshot;
  stats: ArtistStats;
  nextEvent: NextEvent | null;
  recentRequests: RecentRequest[];
}

// Used by the next-event header to drop "Sâmbătă, 24 mai 2025"-style
// labels in Romanian.
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

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  corporate: "Corporate",
  birthday: "Aniversare",
  concert: "Concert",
  other: "Eveniment",
};

export function DashboardClient({
  profile,
  stats,
  nextEvent,
  recentRequests,
}: Props) {
  // Pre-format the deltas so the JSX stays readable. Each tile has its
  // own comparison window (yesterday / last week / last month) chosen to
  // match what the partner actually thinks about for that metric.
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
    <div className="mx-auto max-w-5xl space-y-6">
      {/* ── Welcome header ─────────────────────────────── */}
      <header>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          Panoul Meu
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestionează cererile, calendarul și veniturile dintr-un singur loc.
        </p>
      </header>

      {/* ── Hero: artist + plan + profile completion ───── */}
      <HeroCard profile={profile} />

      {/* ── 4 stat tiles ───────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          Icon={BookOpen}
          tint="indigo"
          big={stats.pendingRequests}
          label="Cereri noi"
          deltaLabel={deltaLabel(pendingDelta, "ieri")}
          deltaPositive={pendingDelta >= 0}
          href="/dashboard/rezervari?status=pending"
        />
        <StatTile
          Icon={CheckCircle2}
          tint="success"
          big={stats.confirmedThisMonth}
          label="Evenimente confirmate"
          deltaLabel={deltaLabel(confirmedDelta, "săpt. trecută")}
          deltaPositive={confirmedDelta >= 0}
          href="/dashboard/rezervari?status=confirmed"
        />
        <StatTile
          Icon={MessageSquare}
          tint="info"
          big={stats.unreadMessages}
          label="Mesaje noi"
          deltaLabel={deltaLabel(messagesDelta, "ieri")}
          deltaPositive={messagesDelta >= 0}
          href="/dashboard/mesaje"
        />
        <StatTile
          Icon={DollarSign}
          tint="gold"
          // EUR cents are stored; format thousands with a dot for the
          // Romanian visual style "24.850" and append "€" as the unit.
          big={formatMoney(stats.revenueThisMonthEUR)}
          label="Venit luna"
          deltaLabel={`${revenuePctDelta >= 0 ? "+" : ""}${revenuePctDelta}% față de luna trecută`}
          deltaPositive={revenuePctDelta >= 0}
          href="/dashboard/financiar"
        />
      </section>

      {/* ── Next event card ────────────────────────────── */}
      {nextEvent && <NextEventCard event={nextEvent} />}

      {/* ── Recent requests list ───────────────────────── */}
      <RecentRequests items={recentRequests} />

      {/* ── 3 bottom shortcuts ─────────────────────────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ShortcutCard
          Icon={CalendarDays}
          title="Calendar"
          description="Vezi programul și evenimentele tale"
          href="/dashboard/calendar"
        />
        <ShortcutCard
          Icon={Clock}
          title="Tarife"
          description="Gestionează pachetele și prețurile"
          href="/dashboard/tarife"
        />
        <ShortcutCard
          Icon={Wallet}
          title="Financiar"
          description="Urmărește veniturile și plățile"
          href="/dashboard/financiar"
        />
      </section>

      {/* ── Footer flourish ────────────────────────────── */}
      <p className="flex items-center justify-center gap-2 pt-2 text-center text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-gold" />
        Succesul tău începe cu o organizare impecabilă.
      </p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────

function HeroCard({ profile }: { profile: ArtistProfileSnapshot }) {
  const initials = profile.nameRo
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const planLabel = profile.isPremium ? "Plan Premium" : "Plan Standard";

  return (
    <section className="overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-card via-card to-gold/5 shadow-[0_4px_30px_rgba(201,168,76,0.08)]">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        {/* Logo / initials chip */}
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-gold/40 bg-background ring-2 ring-gold/20 transition-transform duration-300 hover:scale-105">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photoUrl}
              alt={profile.nameRo}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-heading text-2xl font-bold text-gold">
              {initials || "??"}
            </span>
          )}
        </div>

        {/* Name + plan + progress */}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-xl font-bold sm:text-2xl">
            {profile.nameRo}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{planLabel}</p>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground/80">Profil completat</span>
              <span className="font-semibold text-gold">
                {profile.profileCompletionPct}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-dark to-gold transition-all duration-500 ease-out"
                style={{ width: `${profile.profileCompletionPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/dashboard/profil"
          className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gold/40 px-5 py-2.5 text-sm font-medium text-gold transition-all duration-200 hover:border-gold hover:bg-gold/10 hover:shadow-[0_4px_14px_rgba(201,168,76,0.2)] active:scale-95"
        >
          Completează profilul
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}

function StatTile({
  Icon,
  tint,
  big,
  label,
  deltaLabel,
  deltaPositive,
  href,
}: {
  Icon: typeof BookOpen;
  tint: "indigo" | "success" | "info" | "gold";
  big: number | string;
  label: string;
  deltaLabel: string;
  deltaPositive: boolean;
  href: string;
}) {
  const tintMap = {
    indigo: "bg-indigo-500/15 text-indigo-300",
    success: "bg-emerald-500/15 text-emerald-400",
    info: "bg-sky-500/15 text-sky-300",
    gold: "bg-gold/15 text-gold",
  } as const;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-2xl border border-border/40 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/30 hover:shadow-[0_8px_20px_rgba(201,168,76,0.08)] active:scale-[0.98] sm:p-5"
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
          tintMap[tint],
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl font-bold leading-tight transition-colors duration-200 group-hover:text-gold sm:text-3xl">
          {big}
        </p>
        <p
          className={cn(
            "mt-1 text-[11px]",
            deltaPositive ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {deltaLabel}
        </p>
      </div>
    </Link>
  );
}

function NextEventCard({ event }: { event: NextEvent }) {
  const date = new Date(event.eventDate + "T00:00:00");
  const weekday = WEEKDAYS_RO[date.getDay()];
  const dateLabel = `${date.getDate()} ${MONTHS_RO[date.getMonth()]} ${date.getFullYear()}`;
  const headerDate = `${weekday}, ${dateLabel}`;
  const eventLabel = event.eventType
    ? EVENT_TYPE_LABELS[event.eventType] ?? "Eveniment"
    : "Eveniment";
  // Thematic fallback so the artist always gets a banner image — the
  // wedding shot is the safest default for the most common event type.
  const image = event.venueImage || "/images/backgrounds/party-dance.jpg";

  return (
    <section className="overflow-hidden rounded-2xl border border-border/40 bg-card">
      {/* Header strip with date */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-gold/5 px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4 text-gold" />
          <span className="font-heading font-semibold">
            Următorul eveniment
          </span>
        </div>
        <span className="rounded-full bg-background/60 px-3 py-1 text-[11px] text-muted-foreground">
          {headerDate}
        </span>
      </div>

      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        {/* Cover image */}
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl border border-border/40 transition-all duration-300 hover:border-gold/40 sm:aspect-square sm:w-48">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={event.venueName ?? eventLabel}
            className="h-full w-full object-cover transition-transform duration-500 ease-out hover:scale-110"
            onError={(e) => {
              e.currentTarget.src = "/images/backgrounds/party-dance.jpg";
            }}
          />
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1 space-y-3">
          <h3 className="font-heading text-lg font-bold leading-tight sm:text-xl">
            <span className="text-foreground/70">{eventLabel} —</span>{" "}
            <span>{event.clientName}</span>
          </h3>

          <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2 sm:gap-x-6">
            <MetaRow Icon={CalendarDays} label={dateLabel} />
            {event.startTime && (
              <MetaRow Icon={Clock} label={event.startTime} />
            )}
            {event.location && (
              <MetaRow Icon={MapPin} label={event.location} />
            )}
            {event.eventType && (
              <MetaRow
                Icon={Sparkles}
                label={`Tip eveniment: ${eventLabel}`}
              />
            )}
            <MetaRow
              Icon={Users}
              label={`Client: ${event.clientName}`}
            />
            {event.guestCount != null && (
              <MetaRow
                Icon={Users}
                label={`${event.guestCount} invitați`}
              />
            )}
          </dl>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href={`/dashboard/rezervari?expand=${event.id}`}
              className="group inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-[#0D0D0D] transition-all duration-200 hover:bg-gold-dark hover:shadow-[0_4px_20px_rgba(201,168,76,0.35)] active:scale-95"
            >
              <Eye className="h-4 w-4" /> Deschide cererea
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={`/dashboard/rezervari?expand=${event.id}#booking-${event.id}`}
              className="group inline-flex items-center gap-2 rounded-lg border border-border/60 px-4 py-2.5 text-sm font-medium text-foreground transition-all duration-200 hover:border-gold/40 hover:bg-gold/5 active:scale-95"
            >
              <MessageSquare className="h-4 w-4" /> Mesaj client
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetaRow({
  Icon,
  label,
}: {
  Icon: typeof CalendarDays;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-foreground/85">
      <Icon className="h-4 w-4 shrink-0 text-gold/80" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function RecentRequests({ items }: { items: RecentRequest[] }) {
  return (
    <section className="rounded-2xl border border-border/40 bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-base font-bold">Cereri recente</h3>
        <Link
          href="/dashboard/rezervari"
          className="group inline-flex items-center gap-1 text-xs text-gold transition-all duration-200 hover:gap-2 hover:underline"
        >
          Vezi toate{" "}
          <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Încă nu ai cereri. Profilul tău e online — clienții te pot găsi
          oricând.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((req) => (
            <li key={req.id}>
              <RecentRequestRow req={req} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentRequestRow({ req }: { req: RecentRequest }) {
  const date = new Date(req.eventDate + "T00:00:00");
  const dateLabel = `${date.getDate()} ${MONTHS_RO[date.getMonth()].slice(0, 3)}. ${date.getFullYear()}`;
  const eventLabel = req.eventType
    ? EVENT_TYPE_LABELS[req.eventType] ?? "Eveniment"
    : "Eveniment";
  const pill = statusPill(req.status);

  return (
    <Link
      href={`/dashboard/rezervari?expand=${req.id}`}
      className="group flex items-center gap-3 rounded-xl border border-transparent p-2 transition-all duration-200 hover:translate-x-0.5 hover:border-gold/30 hover:bg-gold/5 active:scale-[0.99]"
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
          pill.iconBg,
        )}
      >
        <BookOpen className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <span className="text-foreground">{eventLabel}</span>
          <span className="text-foreground/60"> — {req.clientName}</span>
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{dateLabel}</span>
          {req.location && <span>· {req.location}</span>}
          {req.guestCount != null && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {req.guestCount} invitați
            </span>
          )}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium",
          pill.badge,
        )}
      >
        {pill.label}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-gold" />
    </Link>
  );
}

function ShortcutCard({
  Icon,
  title,
  description,
  href,
}: {
  Icon: typeof CalendarDays;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-2xl border border-border/40 bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/30 hover:shadow-[0_8px_20px_rgba(201,168,76,0.08)] active:scale-[0.98]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-heading text-base font-bold transition-colors duration-200 group-hover:text-gold">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-gold" />
    </Link>
  );
}

// ─── Helpers ──────────────────────────────────────────────

/** Formats the stat-tile delta caption like "+2 față de ieri" or
 *  "−1 față de săpt. trecută". Hides the sign for zero. */
function deltaLabel(delta: number, vs: string): string {
  if (delta === 0) return `0 față de ${vs}`;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta)} față de ${vs}`;
}

/** Format an EUR amount with thousand-dot separators like the mockup
 *  ("24.850 €"). Storage is integer EUR; we don't deal in cents on the
 *  partner side (booking_requests.agreedPrice is whole EUR). */
function formatMoney(eur: number): string {
  if (eur < 1000) return `${eur} €`;
  const thousand = Math.floor(eur / 1000);
  const remainder = String(eur % 1000).padStart(3, "0");
  return `${thousand}.${remainder} €`;
}

/** Map a booking_request status to the pill UI on the recent-requests
 *  list. Keeps colours consistent with the rest of the partner dash:
 *  pending → indigo (Nou), accepted → gold (În așteptare client),
 *  confirmed_by_client → emerald (Confirmat). */
function statusPill(status: string): {
  label: string;
  badge: string;
  iconBg: string;
} {
  switch (status) {
    case "pending":
      return {
        label: "Nou",
        badge: "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30",
        iconBg: "bg-indigo-500/15 text-indigo-300",
      };
    case "accepted":
      return {
        label: "În așteptare",
        badge: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
        iconBg: "bg-amber-500/15 text-amber-300",
      };
    case "confirmed_by_client":
    case "completed":
      return {
        label: "Confirmat",
        badge: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
        iconBg: "bg-emerald-500/15 text-emerald-400",
      };
    case "rejected":
      return {
        label: "Refuzat",
        badge: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
        iconBg: "bg-rose-500/15 text-rose-300",
      };
    case "cancelled":
      return {
        label: "Anulat",
        badge: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
        iconBg: "bg-rose-500/15 text-rose-300",
      };
    case "expired":
      return {
        label: "Expirat",
        badge: "bg-muted text-muted-foreground ring-1 ring-border/40",
        iconBg: "bg-muted text-muted-foreground",
      };
    default:
      return {
        label: status,
        badge: "bg-muted text-muted-foreground ring-1 ring-border/40",
        iconBg: "bg-muted text-muted-foreground",
      };
  }
}

