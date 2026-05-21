"use client";

// Client cabinet dashboard. Rebuilt to match the mockup the owner sent
// for the redesign — hero card with the active event, next-step prompt,
// 3 stat tiles, services strip, and a conditional bottom row.
//
// Everything below the hero is **conditional on what the client opted
// into during the planning wizard**: budget card only renders when
// budgetEnabled, RSVP stat only when guestsEnabled, Photo Moments card
// only when momentsEnabled. The dashboard never advertises a feature
// the client didn't ask for.
//
// Mobile-first: the layout collapses to a single column under 640px,
// and the hero image moves below the text instead of beside it.

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calendar,
  Camera,
  CheckCircle,
  Clock,
  ClipboardList,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Mic,
  Music,
  Sparkles,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────

interface BookingRequest {
  id: number;
  eventPlanId: number | null;
  artistId: number | null;
  venueId: number | null;
  status: string;
  artistName: string | null;
  artistSlug: string | null;
  venueName: string | null;
  venueSlug: string | null;
  categoryNames?: string[] | null;
  createdAt: string;
  eventDate: string;
}

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
  seatingEnabled: boolean;
  momentsEnabled: boolean;
  selectedCategories: number[];
}

interface ChecklistItem {
  id: number;
  title: string;
  done: boolean;
  category: string | null;
  dueDaysBefore: number | null;
}

interface Guest {
  id: number;
  // Matches the rsvp_status pg enum on guest_list (pending / accepted /
  // declined / maybe). We had this typed as "yes/no" originally which
  // never matched the DB enum — so the RSVP stat always rendered 0.
  rsvp: "pending" | "accepted" | "declined" | "maybe";
  partySize: number;
}

interface Conversation {
  id: number;
  vendorKind: "artist" | "venue";
  vendorName: string | null;
  vendorSlug: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  clientUnread: number;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  corporate: "Corporate",
  birthday: "Aniversare",
  concert: "Concert",
  other: "Eveniment",
};

/** Service "buckets" — each tile on the strip aggregates bookings
 *  whose category name (Romanian) matches one of the keywords below.
 *  We match by Romanian nameRo because that's what the API returns
 *  on the booking row.
 *
 *  When updating: keep all keywords lowercase, no diacritics on the
 *  match side — we lowercase + strip diacritics on the booking name
 *  before comparing. */
const SERVICE_BUCKETS: Array<{
  key: string;
  label: string;
  Icon: typeof Music;
  matches: (categoryNames: string[]) => boolean;
}> = [
  {
    key: "venue",
    label: "Sală",
    Icon: Building2,
    matches: () => false, // venue bookings handled separately
  },
  {
    key: "music",
    label: "Muzică",
    Icon: Music,
    matches: (names) =>
      names.some((n) =>
        ["dj", "cantaret", "formati", "instrumental", "cvartet", "cover-band", "muzic"].some(
          (kw) => n.includes(kw),
        ),
      ),
  },
  {
    key: "photo",
    label: "Foto/Video",
    Icon: Camera,
    matches: (names) =>
      names.some((n) =>
        ["fotograf", "videograf", "foto-video", "video"].some((kw) => n.includes(kw)),
      ),
  },
  {
    key: "moderator",
    label: "Moderator",
    Icon: Mic,
    matches: (names) => names.some((n) => n.includes("moderator")),
  },
  {
    key: "decor",
    label: "Decor",
    Icon: Sparkles,
    matches: (names) =>
      names.some((n) =>
        ["decor", "floristic", "flori"].some((kw) => n.includes(kw)),
      ),
  },
];

/** Strip diacritics + lowercase so "Cântăreți" matches "cantaret". */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

type ServiceStatus = "confirmed" | "pending" | "missing";

interface ServiceTile {
  key: string;
  label: string;
  Icon: typeof Music;
  status: ServiceStatus;
}

// ─── Component ────────────────────────────────────────────────────────

export default function ClientCabinetPage() {
  const { isSignedIn, user: clerkUser, isLoaded } = useUser();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChecklist, setActiveChecklist] = useState<ChecklistItem[]>([]);
  const [activeGuests, setActiveGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Pull active plans + bookings + conversations in parallel.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !clerkUser?.primaryEmailAddress?.emailAddress) {
      setLoading(false);
      return;
    }
    const email = clerkUser.primaryEmailAddress.emailAddress;
    Promise.all([
      fetch("/api/event-plans?status=active", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { plans: [] }))
        .then((d) => (Array.isArray(d?.plans) ? (d.plans as PlanSummary[]) : [])),
      fetch(`/api/booking-requests?client_email=${encodeURIComponent(email)}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? (d as BookingRequest[]) : [])),
      fetch("/api/conversations", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? (d as Conversation[]) : [])),
    ])
      .then(([ps, bs, cs]) => {
        setPlans(ps);
        setBookings(bs);
        setConversations(cs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, clerkUser]);

  // 2. Once we know the active plan, fetch its checklist + guest list
  //    so we can compute progress + RSVP stats.
  const activePlan = plans.length > 0 ? plans[0] : null;
  useEffect(() => {
    if (!activePlan) return;
    fetch(`/api/event-plans/${activePlan.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (Array.isArray(d.checklist)) setActiveChecklist(d.checklist);
        if (Array.isArray(d.guests)) setActiveGuests(d.guests);
      })
      .catch(() => {});
  }, [activePlan]);

  // 3. Derive everything else from the fetched data.
  const planBookings = useMemo(() => {
    if (!activePlan) return [] as BookingRequest[];
    return bookings.filter(
      (b) =>
        b.eventPlanId === activePlan.id ||
        // Fallback: legacy bookings without a plan id, matched by date.
        (b.eventPlanId == null && activePlan.eventDate && b.eventDate === activePlan.eventDate),
    );
  }, [bookings, activePlan]);

  const services: ServiceTile[] = useMemo(() => {
    if (!activePlan) return [];
    const tiles: ServiceTile[] = [];
    for (const bucket of SERVICE_BUCKETS) {
      if (bucket.key === "venue") {
        // Sală appears only when the user said "yes, I need a venue".
        if (!activePlan.venueNeeded) continue;
        const venueBookings = planBookings.filter((b) => b.venueId != null);
        tiles.push({
          key: "venue",
          label: "Sală",
          Icon: Building2,
          status: deriveStatus(venueBookings),
        });
        continue;
      }
      // Other tiles: aggregate by category-name keyword match.
      const matching = planBookings.filter((b) => {
        const names = (b.categoryNames ?? []).map(normalize);
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

  const pendingBookings = useMemo(
    () => planBookings.filter((b) => b.status === "pending").length,
    [planBookings],
  );

  const unreadMessages = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.clientUnread ?? 0), 0),
    [conversations],
  );

  // RSVP-confirmed seats: count partySize for every guest who replied
  // "accepted". (The DB enum is accepted/declined/maybe/pending — not
  // yes/no — see Guest interface above.)
  const rsvpYes = useMemo(
    () =>
      activeGuests
        .filter((g) => g.rsvp === "accepted")
        .reduce((sum, g) => sum + (g.partySize || 1), 0),
    [activeGuests],
  );

  // Progress %: checklist when the user opted in, otherwise services-confirmed/total.
  const progressPct = useMemo(() => {
    if (!activePlan) return 0;
    if (activePlan.checklistEnabled && activeChecklist.length > 0) {
      const done = activeChecklist.filter((i) => i.done).length;
      return Math.round((done / activeChecklist.length) * 100);
    }
    if (services.length === 0) return 0;
    const filled = services.filter((s) => s.status !== "missing").length;
    return Math.round((filled / services.length) * 100);
  }, [activePlan, activeChecklist, services]);

  // Next step suggestion — the first thing the client should tackle.
  const nextStep = useMemo(() => {
    if (!activePlan) return null;
    // First missing service in order: venue → music → photo → moderator → decor.
    const missingTile = services.find((s) => s.status === "missing");
    if (missingTile) {
      return {
        title: `Alege ${missingTile.label.toLowerCase()} pentru eveniment`,
        subtitle: missingTileSubtitle(missingTile.key),
        href: `/cabinet/planifica/${activePlan.id}?tab=${missingTile.key === "venue" ? "venues" : "bookings"}`,
      };
    }
    // No services missing — fall back to checklist if enabled.
    if (activePlan.checklistEnabled) {
      const nextItem = activeChecklist.find((i) => !i.done);
      if (nextItem) {
        return {
          title: nextItem.title,
          subtitle: "Bifează când e gata — următoarea sarcină din checklist.",
          href: `/cabinet/planifica/${activePlan.id}?tab=checklist`,
        };
      }
    }
    // No checklist or all done — encourage the moments feature.
    if (activePlan.momentsEnabled) {
      return {
        title: "Pregătește galeria foto cu QR",
        subtitle:
          "Imprimă QR-ul și pune-l pe mese ca invitații să încarce poze live.",
        href: `/cabinet/moments/${activePlan.id}`,
      };
    }
    return null;
  }, [activePlan, services, activeChecklist]);

  // Venue cover image — fetched lazily by id from /api/venues/[id] so
  // we get the actual uploaded cover (not a guessed file path). Falls
  // back to a generic event-themed background when no venue is linked
  // or the API call fails.
  const venueId = useMemo(() => {
    const b = planBookings.find((b) => b.venueId != null);
    return b?.venueId ?? null;
  }, [planBookings]);
  const [venueImage, setVenueImage] = useState<string>(
    "/images/backgrounds/party-dance.jpg",
  );
  useEffect(() => {
    if (!venueId) {
      setVenueImage("/images/backgrounds/party-dance.jpg");
      return;
    }
    let alive = true;
    fetch(`/api/venues/${venueId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        // /api/venues/[id] returns { ...venue, images: [...], reviews: [...] }
        // — fields are flat at the root level. Try images[0].url first
        // (uploaded cover), then any photoUrl/coverImageUrl alias.
        const cover: string | null =
          (Array.isArray(d.images) && d.images[0]?.url) ||
          d.coverImageUrl ||
          d.photoUrl ||
          null;
        if (cover) setVenueImage(cover);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [venueId]);

  const venueName = useMemo(() => {
    const venueBooking = planBookings.find((b) => b.venueId != null);
    return venueBooking?.venueName ?? null;
  }, [planBookings]);

  // 4. Render.
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* ── Welcome header ──────────────────────────────── */}
      <header>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">
          Bun venit, {clerkUser?.firstName || "utilizator"}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administrează evenimentul tău dintr-un singur loc.
        </p>
      </header>

      {/* ── Empty state when there's no plan yet ────────── */}
      {!activePlan ? (
        <div className="rounded-2xl border border-border/40 bg-card p-8 text-center sm:p-12">
          <Calendar className="mx-auto mb-3 h-10 w-10 text-gold/40" />
          <p className="font-heading text-lg font-bold">
            Nu ai încă un eveniment activ
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pornește planificarea în 7 pași — îți pregătim panoul complet.
          </p>
          <Link
            href="/planifica"
            className="group mt-5 inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-[#0D0D0D] transition-all duration-200 hover:bg-gold-dark hover:shadow-[0_4px_20px_rgba(201,168,76,0.35)] active:scale-95"
          >
            <Sparkles className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" /> Începe să planifici
          </Link>
        </div>
      ) : (
        <>
          {/* ── Hero: active event card ───────────────────── */}
          <HeroCard
            plan={activePlan}
            venueName={venueName}
            venueImage={venueImage}
            progressPct={progressPct}
            progressPrefix={
              activePlan.checklistEnabled && activeChecklist.length > 0
                ? "Organizare"
                : "Servicii confirmate"
            }
            progressSuffix={
              activePlan.checklistEnabled && activeChecklist.length > 0
                ? "completă"
                : ""
            }
          />

          {/* ── Next step ──────────────────────────────────── */}
          {nextStep && <NextStepCard nextStep={nextStep} />}

          {/* ── Stat tiles ─────────────────────────────────── */}
          <StatTiles
            plan={activePlan}
            rsvpYes={rsvpYes}
            pendingBookings={pendingBookings}
            unreadMessages={unreadMessages}
          />

          {/* ── Services strip ─────────────────────────────── */}
          {services.length > 0 && (
            <ServicesStrip planId={activePlan.id} services={services} />
          )}

          {/* ── Bottom row: messages + budget/moments ──────── */}
          <BottomRow
            plan={activePlan}
            conversations={conversations}
          />
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function HeroCard({
  plan,
  venueName,
  venueImage,
  progressPct,
  progressPrefix,
  progressSuffix,
}: {
  plan: PlanSummary;
  venueName: string | null;
  venueImage: string;
  progressPct: number;
  /** Label parts so we can colour the percentage in gold between
   *  prefix and suffix. The percentage is rendered separately to
   *  avoid the "40% 40%" duplication a single-string template would
   *  produce when there's no trailing word ("Servicii confirmate 40%"
   *  has nothing after the number, "Organizare 35% completă" does). */
  progressPrefix: string;
  progressSuffix: string;
}) {
  const dateLabel = plan.eventDate
    ? new Date(plan.eventDate + "T00:00:00").toLocaleDateString("ro-MD", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const eventLabel = plan.eventType
    ? EVENT_TYPE_LABELS[plan.eventType] ?? "Eveniment"
    : "Eveniment";

  return (
    <section className="overflow-hidden rounded-2xl border border-gold/30 bg-card shadow-[0_4px_30px_rgba(201,168,76,0.08)]">
      <div className="p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[3px] text-gold">
          Evenimentul tău activ
        </p>

        <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          {/* Left column — text */}
          <div className="min-w-0 flex-1 space-y-3">
            <h2 className="font-heading text-2xl font-bold leading-tight sm:text-3xl">
              <span className="text-foreground/70">{eventLabel} ·</span>{" "}
              <span>{stripEventPrefix(plan.title, eventLabel)}</span>
            </h2>

            <dl className="space-y-1.5 text-sm">
              {dateLabel && (
                <MetaRow Icon={Calendar} label={dateLabel} />
              )}
              {plan.location && (
                <MetaRow Icon={MapPin} label={plan.location} />
              )}
              {venueName && <MetaRow Icon={Building2} label={venueName} />}
              {plan.guestsEnabled && plan.guestCountTarget && (
                <MetaRow
                  Icon={Users}
                  label={`${plan.guestCountTarget} invitați`}
                />
              )}
            </dl>
          </div>

          {/* Right column — venue / event image */}
          <Link
            href={`/cabinet/planifica/${plan.id}`}
            className="group relative aspect-[4/3] w-full max-w-[280px] shrink-0 overflow-hidden rounded-xl border border-border/40 transition-all duration-300 hover:border-gold/40 hover:shadow-[0_8px_25px_rgba(201,168,76,0.15)] active:scale-[0.98] sm:aspect-[16/10] sm:w-56"
            aria-label="Deschide planul evenimentului"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={venueImage}
              alt={venueName ?? plan.title}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
              onError={(e) => {
                e.currentTarget.src = "/images/backgrounds/party-dance.jpg";
              }}
            />
            <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-all duration-200 group-hover:bg-gold group-hover:text-[#0D0D0D]">
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>

        {/* Progress + CTA — sits at the bottom of the hero card. */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              <span className="text-foreground">{progressPrefix} </span>
              <span className="text-gold">{progressPct}%</span>
              {progressSuffix && (
                <span className="text-foreground"> {progressSuffix}</span>
              )}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gold transition-all"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
          </div>
          <Link
            href={`/cabinet/planifica/${plan.id}`}
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gold/40 px-4 py-2.5 text-sm font-medium text-gold transition-all duration-200 hover:border-gold hover:bg-gold/10 hover:shadow-[0_4px_14px_rgba(201,168,76,0.2)] active:scale-95"
          >
            Vezi planul meu <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function MetaRow({
  Icon,
  label,
}: {
  Icon: typeof Calendar;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-foreground/85">
      <Icon className="h-4 w-4 shrink-0 text-gold/80" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function NextStepCard({
  nextStep,
}: {
  nextStep: { title: string; subtitle: string; href: string };
}) {
  return (
    <section className="group/card flex flex-col gap-4 rounded-2xl border border-border/40 bg-card p-5 transition-all duration-300 hover:border-gold/20 hover:shadow-[0_4px_20px_rgba(201,168,76,0.05)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold transition-transform duration-300 group-hover/card:scale-110 group-hover/card:rotate-3">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Următorul pas
          </p>
          <h3 className="mt-0.5 font-heading text-lg font-bold leading-tight">
            {nextStep.title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {nextStep.subtitle}
          </p>
        </div>
      </div>
      <Link
        href={nextStep.href}
        className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-[#0D0D0D] transition-all duration-200 hover:bg-gold-dark hover:shadow-[0_4px_20px_rgba(201,168,76,0.35)] active:scale-95"
      >
        Continuă organizarea <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
      </Link>
    </section>
  );
}

function StatTiles({
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
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* RSVP tile — only when the client opted into guests in the wizard. */}
      {plan.guestsEnabled && plan.guestCountTarget != null && (
        <StatTile
          Icon={CheckCircle}
          tint="success"
          big={rsvpYes}
          primary="confirmate"
          secondary={`din ${plan.guestCountTarget} invitați`}
          href={`/cabinet/planifica/${plan.id}?tab=guests`}
        />
      )}
      <StatTile
        Icon={Clock}
        tint="gold"
        big={pendingBookings}
        primary="în așteptare"
        secondary="răspunsuri"
        href={`/cabinet/planifica/${plan.id}?tab=bookings`}
      />
      <StatTile
        Icon={MessageCircle}
        tint="indigo"
        big={unreadMessages}
        primary={unreadMessages === 1 ? "mesaj nou" : "mesaje noi"}
        secondary="de la furnizori"
        href="/cabinet/mesaje"
      />
    </section>
  );
}

function StatTile({
  Icon,
  tint,
  big,
  primary,
  secondary,
  href,
}: {
  Icon: typeof CheckCircle;
  tint: "success" | "gold" | "indigo";
  big: number;
  primary: string;
  secondary: string;
  href: string;
}) {
  const tintMap = {
    success: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    gold: "bg-gold/15 text-gold ring-gold/20",
    indigo: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/20",
  } as const;
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/30 hover:shadow-[0_8px_20px_rgba(201,168,76,0.08)] active:scale-[0.98]"
    >
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 transition-transform duration-200 group-hover:scale-110",
          tintMap[tint],
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-heading text-2xl font-bold leading-tight transition-colors duration-200 group-hover:text-gold">{big}</p>
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground/80">{primary}</span>
          {" "}
          {secondary}
        </p>
      </div>
    </Link>
  );
}

function ServicesStrip({
  planId,
  services,
}: {
  planId: number;
  services: ServiceTile[];
}) {
  return (
    <section className="rounded-2xl border border-border/40 bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-base font-bold">
          Servicii pentru eveniment
        </h3>
        <Link
          href={`/cabinet/planifica/${planId}?tab=bookings`}
          className="group inline-flex items-center gap-1 text-xs text-gold transition-all duration-200 hover:gap-2 hover:underline"
        >
          Vezi toate <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
      {/* Horizontal-scroll on mobile so we never crush the 5 tiles into
          unreadable thumbnails. Desktop fits them in a 5-col grid. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 px-1 sm:grid sm:grid-cols-5 sm:gap-3 sm:overflow-visible sm:pb-0 sm:px-0">
        {services.map((s) => (
          <ServiceTileCard key={s.key} planId={planId} service={s} />
        ))}
      </div>
    </section>
  );
}

function ServiceTileCard({
  planId,
  service,
}: {
  planId: number;
  service: ServiceTile;
}) {
  const statusCfg = {
    confirmed: {
      label: "Confirmat",
      pill: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
      iconBg: "bg-emerald-500/10 text-emerald-400",
    },
    pending: {
      label: "În așteptare",
      pill: "bg-gold/15 text-gold ring-gold/30",
      iconBg: "bg-gold/15 text-gold",
    },
    missing: {
      label: "De ales",
      pill: "bg-muted text-muted-foreground ring-border/30",
      iconBg: "bg-muted text-muted-foreground",
    },
  }[service.status];
  return (
    <Link
      href={`/cabinet/planifica/${planId}?tab=${service.key === "venue" ? "venues" : "bookings"}`}
      className="group flex min-w-[7.5rem] flex-col items-center gap-2 rounded-xl border border-border/40 bg-background/40 p-3 text-center transition-all duration-200 hover:-translate-y-1 hover:border-gold/40 hover:bg-background/70 hover:shadow-[0_8px_20px_rgba(201,168,76,0.08)] active:scale-[0.96]"
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3",
          statusCfg.iconBg,
        )}
      >
        <service.Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium transition-colors duration-200 group-hover:text-gold">{service.label}</p>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 transition-transform duration-200 group-hover:scale-105",
          statusCfg.pill,
        )}
      >
        {statusCfg.label}
      </span>
    </Link>
  );
}

function BottomRow({
  plan,
  conversations,
}: {
  plan: PlanSummary;
  conversations: Conversation[];
}) {
  const recent = conversations.slice(0, 3);
  const totalUnread = conversations.reduce(
    (n, c) => n + (c.clientUnread ?? 0),
    0,
  );

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Mesaje recente — replaces the standalone "Mesaje" tile so we
          stop showing the same nav twice on the dashboard. */}
      <div className="flex min-h-[10rem] flex-col rounded-2xl border border-border/40 bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-heading text-base font-bold">Mesaje recente</h3>
          {totalUnread > 0 && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold">
              {totalUnread}
            </span>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nu ai mesaje încă. Deschide o conversație din pagina unui partener.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((c) => (
              <li key={c.id}>
                <Link
                  href="/cabinet/mesaje"
                  className="group flex items-start gap-3 rounded-xl border border-transparent p-2 transition-all duration-200 hover:translate-x-0.5 hover:border-gold/30 hover:bg-gold/5 active:scale-[0.99]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-[11px] font-bold uppercase text-gold transition-transform duration-200 group-hover:scale-110">
                    {(c.vendorName ?? "??").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {c.vendorName ?? "Furnizor"}
                      </p>
                      <p className="shrink-0 text-[11px] text-muted-foreground">
                        {relativeTime(c.lastMessageAt)}
                      </p>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.lastMessagePreview ?? "—"}
                    </p>
                  </div>
                  {c.clientUnread > 0 && (
                    <span
                      aria-label="Mesaj necitit"
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/cabinet/mesaje"
          className="group mt-auto inline-flex items-center gap-1 self-start pt-3 text-xs text-gold transition-all duration-200 hover:gap-2 hover:underline"
        >
          Vezi toate mesajele <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Right column — Buget (if enabled), Photo Moments (if enabled),
          Reviews otherwise. We stack two narrower tiles when both opted-in. */}
      <div className="grid grid-cols-1 gap-4">
        {plan.budgetEnabled && (
          <FeatureCard
            Icon={Wallet}
            title="Buget"
            description="Calculator de buget pentru evenimentul tău."
            href="/calculatoare/buget"
          />
        )}
        {plan.momentsEnabled && (
          <FeatureCard
            Icon={ImageIcon}
            title="Photo Moments"
            description="Galerie live cu QR pentru invitați. Vezi pozele care vin."
            href={`/cabinet/moments/${plan.id}`}
          />
        )}
        {!plan.budgetEnabled && !plan.momentsEnabled && (
          <FeatureCard
            Icon={Star}
            title="Recenzii"
            description="Recenziile pe care le-ai lăsat partenerilor."
            href="/cabinet/recenzii"
          />
        )}
      </div>
    </section>
  );
}

function FeatureCard({
  Icon,
  title,
  description,
  href,
}: {
  Icon: typeof Wallet;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/30 hover:shadow-[0_8px_20px_rgba(201,168,76,0.08)] active:scale-[0.98]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-heading text-base font-bold transition-colors duration-200 group-hover:text-gold">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-gold" />
    </Link>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function deriveStatus(bookings: BookingRequest[]): ServiceStatus {
  if (bookings.some((b) => b.status === "accepted" || b.status === "confirmed_by_client")) {
    return "confirmed";
  }
  if (bookings.some((b) => b.status === "pending")) return "pending";
  return "missing";
}

function missingTileSubtitle(serviceKey: string): string {
  switch (serviceKey) {
    case "venue":
      return "Compară săli și trimite cereri — confirmă disponibilitatea.";
    case "music":
      return "Creează atmosfera perfectă pentru ziua voastră.";
    case "photo":
      return "Alege fotograf și videograf pentru ziua cea mare.";
    case "moderator":
      return "Un moderator bun salvează ritmul evenimentului.";
    case "decor":
      return "Definește paleta și aranjamentele florale.";
    default:
      return "Alege următorul partener pentru evenimentul tău.";
  }
}

/** Strip the event-type prefix (e.g. "Nuntă ") from the plan title so
 *  the heading reads naturally with the colored event label we render
 *  separately. If the title doesn't start with the prefix, return it
 *  unchanged. */
function stripEventPrefix(title: string, eventLabel: string): string {
  const lower = title.toLowerCase();
  const prefix = eventLabel.toLowerCase();
  if (lower.startsWith(prefix)) {
    return title.slice(prefix.length).replace(/^[ ·,-]+/, "");
  }
  return title;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "acum";
  if (min < 60) return `acum ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `acum ${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `acum ${day} ${day === 1 ? "zi" : "zile"}`;
  return new Date(iso).toLocaleDateString("ro-MD", {
    day: "numeric",
    month: "short",
  });
}
