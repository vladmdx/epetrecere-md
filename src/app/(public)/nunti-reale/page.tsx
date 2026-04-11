import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans, artists, venues } from "@/lib/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { Camera, Calendar, MapPin, ArrowRight } from "lucide-react";

// M10 Intern #3 — Real Weddings Gallery (Feature 10).
// Pulls approved + public event photos and groups them by plan, showing a
// grid of "real wedding stories" with the first cover photo per event.
// Each card links to /nunti-reale/[planId] for a full lightbox.

export const metadata: Metadata = generateMeta({
  title: "Nunți reale din Moldova — galerie cu povești adevărate | ePetrecere.md",
  description:
    "Descoperă povești reale de nuntă din Moldova. Fotografii aprobate de cuplurile care au folosit ePetrecere.md — inspirație și idei pentru nunta ta.",
  path: "/nunti-reale",
});

export const revalidate = 3600; // ISR: refresh every hour

interface RealWeddingCard {
  planId: number;
  title: string;
  eventDate: string | null;
  location: string | null;
  coverUrl: string;
  photoCount: number;
  taggedArtists: string[];
  taggedVenues: string[];
}

async function getRealWeddings(): Promise<RealWeddingCard[]> {
  // 1. Find all plans that have at least one approved public photo.
  const rows = await db
    .select({
      planId: eventPhotos.planId,
      title: eventPlans.title,
      eventDate: eventPlans.eventDate,
      location: eventPlans.location,
      coverUrl: sql<string>`(
        SELECT url FROM ${eventPhotos} ep2
        WHERE ep2.plan_id = ${eventPlans.id}
          AND ep2.is_public = true AND ep2.is_approved = true
        ORDER BY ep2.created_at ASC
        LIMIT 1
      )`,
      photoCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${eventPhotos} ep3
        WHERE ep3.plan_id = ${eventPlans.id}
          AND ep3.is_public = true AND ep3.is_approved = true
      )`,
    })
    .from(eventPhotos)
    .innerJoin(eventPlans, eq(eventPhotos.planId, eventPlans.id))
    .where(
      and(eq(eventPhotos.isApproved, true), eq(eventPhotos.isPublic, true)),
    )
    .groupBy(
      eventPhotos.planId,
      eventPlans.id,
      eventPlans.title,
      eventPlans.eventDate,
      eventPlans.location,
    )
    .orderBy(desc(sql`MAX(${eventPhotos.createdAt})`))
    .limit(24);

  if (rows.length === 0) return [];

  // 2. Fetch tagged artist/venue names for each plan.
  const planIds = rows.map((r) => r.planId);
  const [artistTags, venueTags] = await Promise.all([
    db
      .select({
        planId: eventPhotos.planId,
        name: artists.nameRo,
      })
      .from(eventPhotos)
      .innerJoin(artists, eq(eventPhotos.taggedArtistId, artists.id))
      .where(
        and(
          sql`${eventPhotos.planId} IN (${sql.join(planIds.map((id) => sql`${id}`), sql`, `)})`,
          eq(eventPhotos.isApproved, true),
          eq(eventPhotos.isPublic, true),
        ),
      ),
    db
      .select({
        planId: eventPhotos.planId,
        name: venues.nameRo,
      })
      .from(eventPhotos)
      .innerJoin(venues, eq(eventPhotos.taggedVenueId, venues.id))
      .where(
        and(
          sql`${eventPhotos.planId} IN (${sql.join(planIds.map((id) => sql`${id}`), sql`, `)})`,
          eq(eventPhotos.isApproved, true),
          eq(eventPhotos.isPublic, true),
        ),
      ),
  ]);

  const artistMap = new Map<number, Set<string>>();
  for (const r of artistTags) {
    if (!artistMap.has(r.planId)) artistMap.set(r.planId, new Set());
    artistMap.get(r.planId)!.add(r.name);
  }
  const venueMap = new Map<number, Set<string>>();
  for (const r of venueTags) {
    if (!venueMap.has(r.planId)) venueMap.set(r.planId, new Set());
    venueMap.get(r.planId)!.add(r.name);
  }

  return rows
    .filter((r) => r.coverUrl)
    .map((r) => ({
      planId: r.planId,
      title: r.title,
      eventDate: r.eventDate,
      location: r.location,
      coverUrl: r.coverUrl,
      photoCount: r.photoCount ?? 0,
      taggedArtists: Array.from(artistMap.get(r.planId) ?? []),
      taggedVenues: Array.from(venueMap.get(r.planId) ?? []),
    }));
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

export default async function RealWeddingsPage() {
  const weddings = await getRealWeddings();

  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Nunți reale", url: "/nunti-reale" },
  ];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Nunți reale din Moldova",
    numberOfItems: weddings.length,
    itemListElement: weddings.slice(0, 10).map((w, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/nunti-reale/${w.planId}`,
      name: w.title,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-gold">Acasă</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">Nunți reale</span>
        </nav>

        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10">
            <Camera className="h-8 w-8 text-gold" />
          </div>
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            Nunți reale din Moldova
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Povești adevărate de la cuplurile care și-au planificat nunta pe
            ePetrecere.md. Inspirație, idei și furnizori verificați din comunitate.
          </p>
        </header>

        {weddings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/40 bg-card py-20 text-center">
            <Camera className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h2 className="mt-4 font-heading text-lg font-semibold">
              Primele povești sunt pe drum
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              În curând vei putea vedea aici fotografii și povești de la nunți reale.
            </p>
            <Link
              href="/planifica"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2 text-sm font-medium text-background hover:bg-gold-dark"
            >
              Planifică-ți propria nuntă
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {weddings.map((w) => (
              <Link
                key={w.planId}
                href={`/nunti-reale/${w.planId}`}
                className="group overflow-hidden rounded-2xl border border-border/40 bg-card transition-all hover:border-gold/40 hover:shadow-lg"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                  <Image
                    src={w.coverUrl}
                    alt={w.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium">
                    {w.photoCount} foto
                  </div>
                </div>
                <div className="p-5">
                  <h2 className="font-heading text-lg font-semibold group-hover:text-gold">
                    {w.title}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {w.eventDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(w.eventDate).toLocaleDateString("ro-RO", {
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    {w.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {w.location}
                      </span>
                    )}
                  </div>
                  {(w.taggedArtists.length > 0 || w.taggedVenues.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {w.taggedVenues.slice(0, 1).map((n) => (
                        <span
                          key={n}
                          className="rounded-full bg-accent/60 px-2 py-0.5 text-[10px]"
                        >
                          📍 {n}
                        </span>
                      ))}
                      {w.taggedArtists.slice(0, 2).map((n) => (
                        <span
                          key={n}
                          className="rounded-full bg-accent/60 px-2 py-0.5 text-[10px]"
                        >
                          🎤 {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
