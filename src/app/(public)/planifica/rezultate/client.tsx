"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ArtistCard } from "@/components/public/artist-card";
import { VenueCard } from "@/components/public/venue-card";
import { Loader2, Calendar, MapPin, Users, Wallet, Sparkles, ArrowLeft } from "lucide-react";

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

// Map wizard "service" ids to DB category slugs (see scripts/seed.ts).
// Keep this in sync if categories change.
const SERVICE_TO_CATEGORY_SLUG: Record<string, string> = {
  singer: "cantareti",
  mc: "moderatori",
  dj: "dj",
  photographer: "fotografi",
  videographer: "videografi",
  band: "formatii",
  show: "show-program",
  decor: "decor",
  animators: "animatori",
  equipment: "echipament",
  // candy_bar and fireworks have no matching category yet — fall through to
  // "other" and simply show nothing for those sub-lists.
};

// Human-readable labels for the section headings — duplicates the map in
// client.tsx so we don't need to import from the wizard file.
const SERVICE_LABELS: Record<string, string> = {
  singer: "Cântăreți",
  mc: "Moderatori / MC",
  dj: "DJ",
  photographer: "Fotografi",
  videographer: "Videografi",
  band: "Formații / Band",
  show: "Show / Dans",
  decor: "Decor / Floristică",
  candy_bar: "Candy Bar / Tort",
  fireworks: "Foc de artificii",
  animators: "Animatori",
  equipment: "Echipament tehnic",
};

// Minimal shape we accept from /api/artists and /api/venues for the cards.
// These loosely mirror ArtistCardProps/VenueCardProps.
type ArtistItem = Parameters<typeof ArtistCard>[0]["artist"];
type VenueItem = Parameters<typeof VenueCard>[0]["venue"];

interface Category {
  id: number;
  slug: string;
  nameRo: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResultsClient() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const [wizard, setWizard] = useState<WizardData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [artistsByService, setArtistsByService] = useState<
    Record<string, ArtistItem[]>
  >({});
  const [venues, setVenues] = useState<VenueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read wizard data from sessionStorage on mount
  useEffect(() => {
    const raw = sessionStorage.getItem("wizard-data");
    if (!raw) {
      // Nothing in storage — the user probably came here directly. Send them
      // back to start the wizard.
      router.replace("/planifica");
      return;
    }
    try {
      setWizard(JSON.parse(raw));
    } catch {
      router.replace("/planifica");
    }
  }, [router]);

  // Auth gate — Clerk can take a tick to hydrate. Once we know the user is
  // signed-out, bounce them to sign-in with a redirect back to this page.
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace(
        `/sign-in?redirect_url=${encodeURIComponent("/planifica/rezultate")}`,
      );
    }
  }, [isLoaded, isSignedIn, router]);

  // Load categories once so we can translate service ids → category ids
  useEffect(() => {
    let alive = true;
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        // /api/categories may return an array or { items }
        const list: Category[] = Array.isArray(data) ? data : data.items ?? [];
        setCategories(list);
      })
      .catch(() => {
        /* ignore — we'll just show no categorised grids */
      });
    return () => {
      alive = false;
    };
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

  // Fetch artists (per selected service) + venues once we have wizard + categories
  useEffect(() => {
    if (!wizard || !isSignedIn) return;
    if (wizard.services.length > 0 && serviceToCategoryId.size === 0) {
      // categories still loading
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    async function loadAll() {
      try {
        // 1. Artists — one request per selected service so we can render
        // separate grids per category.
        const artistRequests = wizard!.services.map(async (svc) => {
          const categoryId = serviceToCategoryId.get(svc);
          const qs = new URLSearchParams();
          qs.set("limit", "12");
          qs.set("date", wizard!.eventDate);
          if (categoryId !== undefined) qs.set("category", String(categoryId));
          // Budget acts as a soft upper bound per artist — the total budget
          // usually covers several vendors so we don't try to split it here.
          if (wizard!.budget > 0) qs.set("price_max", String(wizard!.budget));

          const res = await fetch(`/api/artists?${qs.toString()}`);
          if (!res.ok) throw new Error("artists fetch failed");
          const json = await res.json();
          return [svc, (json.items ?? []) as ArtistItem[]] as const;
        });

        // 2. Venues — only if the user said they need one
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
    return () => {
      alive = false;
    };
  }, [wizard, isSignedIn, serviceToCategoryId]);

  // Early returns for loading / auth states
  if (!isLoaded || !wizard) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!isSignedIn) {
    // redirect effect will handle navigation; show a placeholder in the meantime
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
      {/* Summary header */}
      <div className="border-b border-border/40 bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-heading text-2xl font-bold">
                Rezultatele tale
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Doar artiști și săli disponibile pentru data ta, filtrate după
                preferințele alese în planificator.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/planifica")}
              className="gap-2"
            >
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
        </div>
      </div>

      {/* Results */}
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
            {/* Venues (if requested) */}
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

            {/* Artists by selected category */}
            {wizard.services.map((svc) => {
              const items = artistsByService[svc] ?? [];
              return (
                <section key={svc}>
                  <SectionHeader
                    title={SERVICE_LABELS[svc] ?? svc}
                    subtitle={`Artiști liberi pe ${formattedDate} din această categorie`}
                    count={items.length}
                  />
                  {items.length === 0 ? (
                    <EmptyState message="Niciun artist disponibil în această categorie pentru data aleasă." />
                  ) : (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                      {items.map((a) => (
                        <ArtistCard key={a.id} artist={a} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}

            {/* No selection at all — shouldn't happen thanks to validation, but render a CTA just in case */}
            {wizard.services.length === 0 && wizard.venueNeeded !== "yes" && (
              <EmptyState message="Nu ai selectat nicio categorie. Revino și alege cel puțin una." />
            )}
          </div>
        )}

        {/* Footer CTA */}
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

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

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
