"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Calendar,
  Loader2,
  Clock,
  Users,
  Music,
  Building2,
  ExternalLink,
  BookOpen,
  ClipboardList,
  Star,
  MessageCircle,
  ArrowRight,
  FileSignature,
} from "lucide-react";
import { SignContractDialog } from "@/components/client/sign-contract-dialog";
import { cn } from "@/lib/utils";

interface BookingRequest {
  id: number;
  eventPlanId: number | null;
  artistId: number | null;
  venueId: number | null;
  clientName: string;
  clientEmail: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  guestCount: number | null;
  message: string | null;
  status: string;
  artistReply: string | null;
  artistName: string | null;
  artistSlug: string | null;
  /** Resolved on the server from artist.categoryIds → category.nameRo. */
  categoryNames?: string[] | null;
  venueName: string | null;
  venueSlug: string | null;
  agreedPrice?: number | null;
  /** Latest counter-offer amount (so we can show what the partner /
   *  client are negotiating instead of the original ask). */
  priceOffers?: Array<{ amount: number }> | null;
  createdAt: string;
}

interface PlanSummary {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCountTarget: number | null;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "In așteptare", color: "text-warning border-warning/30 bg-warning/5" },
  // The partner's accept is final now — no separate client step. Both
  // "accepted" (legacy bookings) and "confirmed_by_client" (new) are
  // surfaced as "Confirmat" so the client doesn't see two different
  // shades of "yes" for the same outcome.
  accepted: { label: "Confirmat", color: "text-success border-success/30 bg-success/5" },
  confirmed_by_client: { label: "Confirmat", color: "text-success border-success/30 bg-success/5" },
  rejected: { label: "Refuzat", color: "text-destructive border-destructive/30 bg-destructive/5" },
  cancelled: { label: "Anulat", color: "text-muted-foreground border-border/40 bg-muted/5" },
  completed: { label: "Finalizat", color: "text-gold border-gold/30 bg-gold/5" },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  corporate: "Corporate",
  birthday: "Aniversare",
  other: "Alt eveniment",
};

export default function ClientCabinetPage() {
  const { isSignedIn, user: clerkUser } = useUser();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn || !clerkUser?.primaryEmailAddress?.emailAddress) return;
    const email = clerkUser.primaryEmailAddress.emailAddress;
    Promise.all([
      fetch(`/api/booking-requests?client_email=${encodeURIComponent(email)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => (Array.isArray(data) ? (data as BookingRequest[]) : [])),
      fetch("/api/event-plans?status=active", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { plans: [] }))
        .then((data) =>
          Array.isArray(data?.plans) ? (data.plans as PlanSummary[]) : [],
        ),
    ])
      .then(([bs, ps]) => {
        setBookings(bs);
        setPlans(ps);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isSignedIn, clerkUser]);


  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const activeBookings = bookings.filter((b) =>
    ["pending", "accepted", "confirmed_by_client"].includes(b.status),
  );

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">
          Bun venit, {clerkUser?.firstName || "utilizator"}!
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rezumatul evenimentelor și rezervărilor tale
        </p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Link href="/cabinet/rezervari" className="rounded-xl border border-border/40 bg-card p-4 text-center transition-all hover:border-gold/40">
          <BookOpen className="mx-auto mb-2 h-5 w-5 text-gold" />
          <p className="text-sm font-medium">Rezervări</p>
          <p className="text-xs text-muted-foreground">{bookings.length} total</p>
        </Link>
        <Link href="/cabinet/mesaje" className="rounded-xl border border-border/40 bg-card p-4 text-center transition-all hover:border-gold/40">
          <MessageCircle className="mx-auto mb-2 h-5 w-5 text-gold" />
          <p className="text-sm font-medium">Mesaje</p>
          <p className="text-xs text-muted-foreground">Conversații</p>
        </Link>
        <Link href="/cabinet/planifica" className="rounded-xl border border-border/40 bg-card p-4 text-center transition-all hover:border-gold/40">
          <ClipboardList className="mx-auto mb-2 h-5 w-5 text-gold" />
          <p className="text-sm font-medium">Planificator</p>
          <p className="text-xs text-muted-foreground">Eveniment</p>
        </Link>
        <Link href="/cabinet/recenzii" className="rounded-xl border border-border/40 bg-card p-4 text-center transition-all hover:border-gold/40">
          <Star className="mx-auto mb-2 h-5 w-5 text-gold" />
          <p className="text-sm font-medium">Recenzii</p>
          <p className="text-xs text-muted-foreground">Feedback</p>
        </Link>
      </div>

      {/* Active Bookings */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">Rezervări active</h2>
        {bookings.length > 0 && (
          <Link href="/cabinet/rezervari" className="text-xs text-gold hover:underline flex items-center gap-1">
            Vezi toate <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {activeBookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-gold/40" />
            <p className="text-muted-foreground">Nu ai rezervări active.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Explorează artiști și fă prima ta rezervare!
            </p>
            <Link
              href="/artisti"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
            >
              Explorează artiști
            </Link>
          </CardContent>
        </Card>
      ) : (
        <BookingsByPlan
          bookings={activeBookings}
          plans={plans}
          render={(b) => {
            const cfg = statusConfig[b.status] || statusConfig.pending;
            const eventLabel = b.eventType
              ? EVENT_TYPE_LABELS[b.eventType] || b.eventType
              : "Eveniment";

            // Latest negotiated price (counter-offer wins) or the
            // original agreed price.
            const lastOffer = b.priceOffers?.length
              ? b.priceOffers[b.priceOffers.length - 1].amount
              : null;
            const displayPrice = lastOffer ?? b.agreedPrice ?? null;
            // eventLabel is a no-op here now — kept assigned in case
            // some downstream tweak needs it again, but no longer
            // rendered inside the per-booking card. The plan header
            // above the cards already carries the event type so
            // duplicating it on every booking was just noise.
            void eventLabel;
            return (
              <Card key={b.id} className="transition-all hover:border-gold/30">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      {/* Status + category + price chips. Event type
                          intentionally omitted — see the parent
                          BookingsByPlan header. */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn("text-xs", cfg.color)}>
                          {cfg.label}
                        </Badge>
                        {b.categoryNames && b.categoryNames.length > 0 && (
                          <Badge
                            variant="outline"
                            className="text-xs text-gold/80 border-gold/30 bg-gold/5"
                          >
                            {b.categoryNames.join(" · ")}
                          </Badge>
                        )}
                        {displayPrice != null && (
                          <Badge
                            variant="outline"
                            className="text-xs text-gold border-gold/30 bg-gold/5"
                          >
                            {displayPrice}€
                          </Badge>
                        )}
                      </div>

                      {/* Vendor info — artist or venue */}
                      {b.artistName && (
                        <div className="flex items-center gap-2 text-sm">
                          <Music className="h-3.5 w-3.5 text-gold" />
                          {b.artistSlug ? (
                            <Link
                              href={`/artisti/${b.artistSlug}`}
                              className="font-medium hover:text-gold flex items-center gap-1"
                            >
                              {b.artistName}
                              <ExternalLink className="h-3 w-3 opacity-50" />
                            </Link>
                          ) : (
                            <span className="font-medium">{b.artistName}</span>
                          )}
                        </div>
                      )}
                      {b.venueName && (
                        <div className="flex items-center gap-2 text-sm">
                          <Building2 className="h-3.5 w-3.5 text-gold" />
                          {b.venueSlug ? (
                            <Link
                              href={`/sali/${b.venueSlug}`}
                              className="font-medium hover:text-gold flex items-center gap-1"
                            >
                              {b.venueName}
                              <ExternalLink className="h-3 w-3 opacity-50" />
                            </Link>
                          ) : (
                            <span className="font-medium">{b.venueName}</span>
                          )}
                        </div>
                      )}

                      {/* Event details */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(b.eventDate).toLocaleDateString("ro-MD", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        {b.startTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {b.startTime}
                            {b.endTime ? ` – ${b.endTime}` : ""}
                          </span>
                        )}
                        {b.guestCount && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {b.guestCount} invitați
                          </span>
                        )}
                      </div>

                      {/* Client message */}
                      {b.message && (
                        <div className="rounded-lg bg-accent/30 p-2.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Mesajul tău:</span>{" "}
                          {b.message}
                        </div>
                      )}

                      {/* Artist reply */}
                      {b.artistReply && (
                        <div className="rounded-lg bg-gold/5 border border-gold/10 p-2.5 text-xs">
                          <span className="font-medium text-gold">Răspunsul artistului:</span>{" "}
                          <span className="text-foreground">{b.artistReply}</span>
                        </div>
                      )}

                      {/* Created date */}
                      <p className="text-[10px] text-muted-foreground/60">
                        Trimisă pe {new Date(b.createdAt).toLocaleDateString("ro-MD")}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-stretch gap-2 shrink-0">
                      {(b.status === "accepted" ||
                        b.status === "confirmed_by_client") && (
                        <SignContractDialog
                          bookingId={b.id}
                          trigger={
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs w-full"
                            >
                              <FileSignature className="h-3.5 w-3.5" />
                              Contract
                            </Button>
                          }
                        />
                      )}
                      {b.artistSlug && (
                        <Link href={`/artisti/${b.artistSlug}`}>
                          <Button variant="outline" size="sm" className="gap-1 text-xs w-full">
                            <Music className="h-3.5 w-3.5" /> Profil
                          </Button>
                        </Link>
                      )}
                      {!b.artistSlug && b.venueSlug && (
                        <Link href={`/sali/${b.venueSlug}`}>
                          <Button variant="outline" size="sm" className="gap-1 text-xs w-full">
                            <Building2 className="h-3.5 w-3.5" /> Profil
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }}
        />
      )}
    </div>
  );
}

/**
 * Group bookings under their event_plan header so the user sees a
 * proper agenda ("Botezul lui Gabi · 29 mai 2026 · Chișinău · 40
 * invitați") followed by every booking on that plan, instead of one
 * flat list where it's not obvious which booking belongs to which
 * event. Bookings without a plan id (legacy or admin-seeded) fall
 * into a "Fără eveniment" bucket at the bottom.
 */
function BookingsByPlan({
  bookings,
  plans,
  render,
}: {
  bookings: BookingRequest[];
  plans: PlanSummary[];
  render: (b: BookingRequest) => React.ReactElement;
}) {
  const planById = new Map(plans.map((p) => [p.id, p]));
  const groups = new Map<number | "none", BookingRequest[]>();
  for (const b of bookings) {
    const key = b.eventPlanId ?? "none";
    const arr = groups.get(key);
    if (arr) arr.push(b);
    else groups.set(key, [b]);
  }
  // Order groups: real plans first by event date asc; "none" bucket last.
  const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "none") return 1;
    if (b === "none") return -1;
    const da = planById.get(a as number)?.eventDate ?? "";
    const db = planById.get(b as number)?.eventDate ?? "";
    return da.localeCompare(db);
  });

  return (
    <div className="space-y-6">
      {orderedKeys.map((key) => {
        const list = groups.get(key) ?? [];
        const plan = key !== "none" ? planById.get(key as number) : null;

        // Pick a venue header from the bookings if any of them is a
        // venue request — saves the user from clicking into the event
        // to see where it's happening.
        const venueBooking = list.find((b) => b.venueName);

        const eventLabel = plan?.eventType
          ? EVENT_TYPE_LABELS[plan.eventType] ?? plan.eventType
          : "Eveniment";
        const dateLabel = plan?.eventDate
          ? new Date(plan.eventDate + "T00:00:00").toLocaleDateString("ro-MD", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : null;

        return (
          <section
            key={String(key)}
            className="overflow-hidden rounded-xl border border-gold/30 bg-gold/5"
          >
            {/* Plan header — bold title + meta line. Doubles as link
                back into the plan detail page when we have an id.
                Bookings nest INSIDE this container so the user sees
                them as part of the event group, not adjacent cards. */}
            <header className="border-b border-gold/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-gold/70">
                    {eventLabel}
                  </p>
                  <h3 className="font-heading text-base font-bold">
                    {plan?.title ?? "Cereri fără eveniment alocat"}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {dateLabel && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {dateLabel}
                      </span>
                    )}
                    {plan?.location && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {plan.location}
                      </span>
                    )}
                    {venueBooking?.venueName && (
                      <span className="flex items-center gap-1 text-gold/80">
                        <Building2 className="h-3 w-3" />
                        {venueBooking.venueName}
                      </span>
                    )}
                    {plan?.guestCountTarget && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {plan.guestCountTarget} invitați
                      </span>
                    )}
                    <span className="text-gold/80">
                      {list.length} cere{list.length === 1 ? "re" : "ri"}
                    </span>
                  </div>
                </div>
                {plan && (
                  <Link
                    href={`/cabinet/planifica/${plan.id}`}
                    className="rounded-lg border border-gold/30 px-3 py-1.5 text-xs text-gold hover:bg-gold/10"
                  >
                    Deschide eveniment →
                  </Link>
                )}
              </div>
            </header>
            <div className="space-y-3 bg-background/40 p-3 sm:p-4">
              {list.map((b) => render(b))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
