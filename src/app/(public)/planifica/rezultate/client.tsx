"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { BookingArtistCard } from "@/components/public/booking-artist-card";
import { VenueCard } from "@/components/public/venue-card";
import {
  Loader2,
  Calendar,
  MapPin,
  Users,
  Wallet,
  Sparkles,
  ArrowLeft,
  ClipboardList,
  ExternalLink,
} from "lucide-react";
import {
  SERVICE_TO_CATEGORY_SLUG,
  SERVICE_LABELS,
} from "@/lib/wizard/service-mapping";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WizardData {
  eventType: string;
  eventDate: string;
  location: string;
  timeSlot: string;
  guestCount: number;
  venueNeeded: "" | "yes" | "no";
  services: string[];
  budget: number;
  name: string;
  phone: string;
  email: string;
}

// Card props type for artist with categoryIds
type ArtistItem = Parameters<typeof BookingArtistCard>[0]["artist"] & {
  categoryIds?: number[];
};
type VenueItem = Parameters<typeof VenueCard>[0]["venue"];

interface Category {
  id: number;
  slug: string;
  nameRo: string;
}

const MAX_PER_CATEGORY = 5;

interface ResultsClientProps {
  adminMode?: boolean;
}

export function ResultsClient({ adminMode = false }: ResultsClientProps = {}) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const storageKey = adminMode ? "admin-wizard-data" : "wizard-data";
  const planIdKey = adminMode ? "admin-wizard-plan-id" : "wizard-plan-id";
  const backRoute = adminMode ? "/admin/eveniment-nou" : "/planifica";
  const [wizard, setWizard] = useState<WizardData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [artistsByService, setArtistsByService] = useState<
    Record<string, ArtistItem[]>
  >({});
  const [venues, setVenues] = useState<VenueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  /** Set of artist IDs that already have a booking request for this plan. */
  const [bookedArtistIds, setBookedArtistIds] = useState<Set<number>>(new Set());
  /** Count of bookings per category — used to enforce MAX_PER_CATEGORY limit. */
  const [bookingsPerCategory, setBookingsPerCategory] = useState<Map<number, number>>(new Map());

  // Read wizard data from sessionStorage on mount
  useEffect(() => {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      router.replace(backRoute);
      return;
    }
    try {
      setWizard(JSON.parse(raw));
    } catch {
      router.replace(backRoute);
    }
  }, [router, storageKey, backRoute]);

  // Auth gate — admin mode is already protected by the admin layout
  useEffect(() => {
    if (adminMode) return;
    if (isLoaded && !isSignedIn) {
      router.replace(
        `/sign-in?redirect_url=${encodeURIComponent("/planifica/rezultate")}`,
      );
    }
  }, [isLoaded, isSignedIn, router, adminMode]);

  // Create event plan and redirect authenticated non-admin users to their
  // plan's "Rezervări Artiști" tab so they see the discovery grid in
  // their own dashboard. Admins stay on this page.
  useEffect(() => {
    if (!isLoaded || !wizard) return;
    if (!adminMode && !isSignedIn) return;

    const cached = sessionStorage.getItem(planIdKey);
    if (cached) {
      if (!adminMode) {
        router.replace(`/cabinet/planifica/${cached}?tab=bookings`);
        return;
      }
      setPlanId(Number(cached));
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/event-plans/from-wizard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(wizard),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.plan?.id) {
          sessionStorage.setItem(planIdKey, String(data.plan.id));
          if (!adminMode) {
            router.replace(`/cabinet/planifica/${data.plan.id}?tab=bookings`);
            return;
          }
          setPlanId(data.plan.id);
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, [isLoaded, isSignedIn, wizard, adminMode, planIdKey, router]);

  // Load categories
  useEffect(() => {
    let alive = true;
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const list: Category[] = Array.isArray(data) ? data : data.items ?? [];
        setCategories(list);
      })
      .catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, []);

  const serviceToCategoryId = useMemo(() => {
    const bySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const map = new Map<string, number>();
    for (const [service, slug] of Object.entries(SERVICE_TO_CATEGORY_SLUG)) {
      const id = bySlug.get(slug);
      if (id !== undefined) map.set(service, id);
    }
    return map;
  }, [categories]);

  // Load existing bookings for this plan (to enforce limits and show "already booked")
  const refreshPlanBookings = useCallback(async () => {
    if (!planId) return;
    try {
      const res = await fetch(`/api/booking-requests?event_plan_id=${planId}`);
      if (!res.ok) return;
      const bookings = await res.json();
      const idSet = new Set<number>();
      for (const b of bookings) {
        if (b?.artistId) idSet.add(Number(b.artistId));
      }
      setBookedArtistIds(idSet);
    } catch { /* ignore */ }
  }, [planId]);

  useEffect(() => { refreshPlanBookings(); }, [refreshPlanBookings]);

  // Fetch artists & venues
  useEffect(() => {
    if (!wizard) return;
    if (!adminMode && !isSignedIn) return;
    if (wizard.services.length > 0 && serviceToCategoryId.size === 0) return;

    let alive = true;
    setLoading(true);
    setError(null);

    async function loadAll() {
      try {
        const artistRequests = wizard!.services.map(async (svc) => {
          const categoryId = serviceToCategoryId.get(svc);
          const qs = new URLSearchParams();
          qs.set("limit", "12");
          qs.set("date", wizard!.eventDate);
          if (categoryId !== undefined) qs.set("category", String(categoryId));
          if (wizard!.budget > 0) qs.set("price_max", String(wizard!.budget));

          const res = await fetch(`/api/artists?${qs.toString()}`);
          if (!res.ok) throw new Error("artists fetch failed");
          const json = await res.json();
          return [svc, (json.items ?? []) as ArtistItem[]] as const;
        });

        const venuePromise =
          wizard!.venueNeeded === "yes"
            ? (async () => {
                const qs = new URLSearchParams();
                qs.set("limit", "12");
                qs.set("date", wizard!.eventDate);
                if (wizard!.location) qs.set("city", wizard!.location);
                if (wizard!.guestCount > 0)
                  qs.set("capacity_min", String(wizard!.guestCount));
                const res = await fetch(`/api/venues?${qs.toString()}`);
                if (!res.ok) throw new Error("venues fetch failed");
                const json = await res.json();
                return (json.items ?? []) as VenueItem[];
              })()
            : Promise.resolve([] as VenueItem[]);

        const [artistResults, venueResults] = await Promise.all([
          Promise.all(artistRequests),
          venuePromise,
        ]);

        if (!alive) return;

        const grouped: Record<string, ArtistItem[]> = {};
        for (const [svc, items] of artistResults) grouped[svc] = items;
        setArtistsByService(grouped);
        setVenues(venueResults);
      } catch {
        if (alive) setError("Nu am putut încărca rezultatele. Încearcă din nou.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadAll();
    return () => { alive = false; };
  }, [wizard, isSignedIn, serviceToCategoryId, adminMode]);

  // Recompute bookings per category from current state
  useEffect(() => {
    const counts = new Map<number, number>();
    for (const [svc, list] of Object.entries(artistsByService)) {
      const catId = serviceToCategoryId.get(svc);
      if (catId === undefined) continue;
      const booked = list.filter((a) => bookedArtistIds.has(a.id)).length;
      counts.set(catId, (counts.get(catId) ?? 0) + booked);
    }
    setBookingsPerCategory(counts);
  }, [artistsByService, bookedArtistIds, serviceToCategoryId]);

  const handleBookingSent = useCallback((artistId: number) => {
    setBookedArtistIds((prev) => {
      const next = new Set(prev);
      next.add(artistId);
      return next;
    });
  }, []);

  if (!isLoaded || !wizard) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!adminMode && !isSignedIn) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const formattedDate = wizard.eventDate
    ? new Date(wizard.eventDate + "T00:00:00").toLocaleDateString("ro-RO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="border-b border-border/40 bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-heading text-2xl font-bold">Rezultatele tale</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Doar artiști și săli disponibile pentru data ta. Trimite cereri de
                rezervare direct de aici (max 5 artiști per categorie).
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push(backRoute)} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Modifică planificarea
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <SummaryChip icon={<Calendar className="h-3.5 w-3.5" />} label={formattedDate} />
            <SummaryChip icon={<MapPin className="h-3.5 w-3.5" />} label={wizard.location || "—"} />
            <SummaryChip icon={<Users className="h-3.5 w-3.5" />} label={`${wizard.guestCount} invitați`} />
            <SummaryChip icon={<Wallet className="h-3.5 w-3.5" />} label={`Buget ${wizard.budget.toLocaleString()}€`} />
            {wizard.venueNeeded === "yes" && (
              <SummaryChip icon={<Sparkles className="h-3.5 w-3.5" />} label="Cu sală" />
            )}
          </div>

          {planId && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-2.5 text-sm">
              <ClipboardList className="h-4 w-4 text-gold shrink-0" />
              <p className="flex-1 text-foreground/90">
                Planul tău a fost creat automat. Cererile trimise vor apărea în
                tabul <span className="font-medium text-gold">Rezervări Artiști</span>.
              </p>
              <Link
                href={adminMode ? `/admin/crm` : `/cabinet/planifica/${planId}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-gold hover:underline"
              >
                {adminMode ? "Vezi în CRM" : "Deschide planul"} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-14">
            {wizard.venueNeeded === "yes" && (
              <section>
                <SectionHeader
                  title="Săli disponibile"
                  subtitle={`Săli libere pe ${formattedDate} pentru minim ${wizard.guestCount} invitați`}
                  count={venues.length}
                />
                {venues.length === 0 ? (
                  <EmptyState message="Nicio sală disponibilă pentru filtrele alese. Încearcă să modifici data sau numărul de invitați." />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {venues.map((venue) => (
                      <VenueCard key={venue.id} venue={venue} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {wizard.services.map((svc) => {
              const items = artistsByService[svc] ?? [];
              const catId = serviceToCategoryId.get(svc);
              const usedInCategory =
                catId !== undefined ? (bookingsPerCategory.get(catId) ?? 0) : 0;
              const remaining = MAX_PER_CATEGORY - usedInCategory;
              const categoryLimitReached = remaining <= 0;

              return (
                <section key={svc}>
                  <SectionHeader
                    title={SERVICE_LABELS[svc] ?? svc}
                    subtitle={`${items.length} artiști liberi · ${usedInCategory}/${MAX_PER_CATEGORY} cereri trimise`}
                    count={items.length}
                  />
                  {items.length === 0 ? (
                    <EmptyState message="Niciun artist disponibil în această categorie pentru data aleasă." />
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {items.map((a) => {
                        const alreadyBooked = bookedArtistIds.has(a.id);
                        return (
                          <BookingArtistCard
                            key={a.id}
                            artist={a}
                            eventContext={{
                              eventDate: wizard.eventDate,
                              eventType: wizard.eventType,
                              guestCount: wizard.guestCount,
                              clientName: wizard.name,
                              clientPhone: wizard.phone,
                              clientEmail: wizard.email || undefined,
                              eventPlanId: planId,
                            }}
                            alreadyBooked={alreadyBooked}
                            categoryLimitReached={
                              !alreadyBooked && categoryLimitReached
                            }
                            onBookingSent={handleBookingSent}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

            {wizard.services.length === 0 && wizard.venueNeeded !== "yes" && (
              <EmptyState message="Nu ai selectat nicio categorie. Revino și alege cel puțin una." />
            )}
          </div>
        )}

        <div className="mt-16 flex flex-col items-center gap-3 rounded-xl border border-gold/20 bg-gold/5 p-8 text-center">
          <p className="font-heading text-lg">Nu găsești ce cauți?</p>
          <p className="text-sm text-muted-foreground">
            Trimite-ne detaliile evenimentului și te ajutăm să găsim combinația perfectă.
          </p>
          <Link href="/contact">
            <Button className="mt-2 bg-gold text-background hover:bg-gold-dark">
              Contactează-ne
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background px-3 py-1 text-foreground/80">
      {icon}
      <span>{label}</span>
    </span>
  );
}

function SectionHeader({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle?: string;
  count?: number;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="font-heading text-xl font-bold">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {typeof count === "number" && (
        <span className="text-xs text-muted-foreground">{count} rezultate</span>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/40 bg-card/30 p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
