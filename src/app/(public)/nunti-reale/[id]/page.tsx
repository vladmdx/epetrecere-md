import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { eventPhotos, eventPlans, artists, venues } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { Calendar, MapPin, ArrowLeft, Users } from "lucide-react";
import { RealWeddingGallery } from "./gallery";

// M10 Intern #3 — Real Wedding detail page.
// Server component: fetches all public+approved photos for a plan plus
// any tagged artist/venue metadata, then hands the photo list to the
// lightbox client component.

interface Props {
  params: Promise<{ id: string }>;
}

export const revalidate = 3600;

async function getWedding(id: number) {
  const [plan] = await db
    .select()
    .from(eventPlans)
    .where(eq(eventPlans.id, id))
    .limit(1);
  if (!plan) return null;

  const photos = await db
    .select()
    .from(eventPhotos)
    .where(
      and(
        eq(eventPhotos.planId, id),
        eq(eventPhotos.isApproved, true),
        eq(eventPhotos.isPublic, true),
      ),
    );

  if (photos.length === 0) return null;

  const artistIds = Array.from(
    new Set(photos.map((p) => p.taggedArtistId).filter(Boolean) as number[]),
  );
  const venueIds = Array.from(
    new Set(photos.map((p) => p.taggedVenueId).filter(Boolean) as number[]),
  );

  const [taggedArtists, taggedVenues] = await Promise.all([
    artistIds.length
      ? db
          .select({
            id: artists.id,
            nameRo: artists.nameRo,
            slug: artists.slug,
          })
          .from(artists)
          .where(inArray(artists.id, artistIds))
      : Promise.resolve([]),
    venueIds.length
      ? db
          .select({
            id: venues.id,
            nameRo: venues.nameRo,
            slug: venues.slug,
          })
          .from(venues)
          .where(inArray(venues.id, venueIds))
      : Promise.resolve([]),
  ]);

  return { plan, photos, taggedArtists, taggedVenues };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getWedding(Number(id));
  if (!data) return {};

  return generateMeta({
    title: `${data.plan.title} — Nuntă reală`,
    description: `Poveste reală de nuntă: ${data.plan.title}${
      data.plan.location ? ` în ${data.plan.location}` : ""
    }. ${data.photos.length} fotografii, furnizori verificați.`,
    path: `/nunti-reale/${id}`,
  });
}

export default async function RealWeddingPage({ params }: Props) {
  const { id } = await params;
  const data = await getWedding(Number(id));
  if (!data) notFound();

  const { plan, photos, taggedArtists, taggedVenues } = data;

  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Nunți reale", url: "/nunti-reale" },
    { name: plan.title, url: `/nunti-reale/${id}` },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)),
        }}
      />

      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8">
        <Link
          href="/nunti-reale"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" />
          Înapoi la galerie
        </Link>

        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {plan.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
            {plan.eventDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {new Date(plan.eventDate).toLocaleDateString("ro-RO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            )}
            {plan.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {plan.location}
              </span>
            )}
            {plan.guestCountTarget && (
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {plan.guestCountTarget} invitați
              </span>
            )}
          </div>
        </header>

        {/* Tagged vendors */}
        {(taggedArtists.length > 0 || taggedVenues.length > 0) && (
          <div className="mb-8 rounded-2xl border border-border/40 bg-card p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Furnizorii de la acest eveniment
            </p>
            <div className="flex flex-wrap gap-2">
              {taggedVenues.map((v) => (
                <Link
                  key={`v-${v.id}`}
                  href={`/sali/${v.slug}`}
                  className="rounded-full border border-border/40 bg-background px-3 py-1.5 text-sm hover:border-gold/40 hover:text-gold"
                >
                  📍 {v.nameRo}
                </Link>
              ))}
              {taggedArtists.map((a) => (
                <Link
                  key={`a-${a.id}`}
                  href={`/artisti/${a.slug}`}
                  className="rounded-full border border-border/40 bg-background px-3 py-1.5 text-sm hover:border-gold/40 hover:text-gold"
                >
                  🎤 {a.nameRo}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Gallery */}
        <RealWeddingGallery
          photos={photos.map((p) => ({
            id: p.id,
            url: p.url,
            caption: p.caption,
          }))}
        />

        <div className="mt-12 rounded-2xl border border-gold/20 bg-gold/5 p-6 text-center">
          <h3 className="mb-2 font-heading text-lg font-semibold">
            Inspirat de povestea lor?
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Începe planificarea propriei tale nunți cu instrumentele și
            furnizorii noștri.
          </p>
          <Link
            href="/planifica"
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-2.5 text-sm font-medium text-background hover:bg-gold-dark"
          >
            Planifică nunta ta
          </Link>
        </div>
      </div>
    </>
  );
}
