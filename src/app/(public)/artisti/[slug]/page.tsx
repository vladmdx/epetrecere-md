import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { redirects } from "@/lib/db/schema";
import {
  getArtistBySlug,
  getSimilarArtists,
  getUgcPhotosForArtist,
} from "@/lib/db/queries/artists";
import { generateMeta } from "@/lib/seo/generate-meta";
import { artistJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { getLocalized } from "@/i18n";
import { ArtistDetailClient } from "./client";
import { ViewTracker } from "@/components/public/view-tracker";

/** AD-29: resolve slug redirect chain — follows up to 5 hops to guard against loops. */
async function resolveRedirect(slug: string): Promise<string | null> {
  let currentPath = `/artisti/${slug}`;
  for (let i = 0; i < 5; i++) {
    const [row] = await db
      .select({ toPath: redirects.toPath })
      .from(redirects)
      .where(eq(redirects.fromPath, currentPath))
      .limit(1);
    if (!row) break;
    currentPath = row.toPath;
  }
  // Only return if we actually moved somewhere different
  return currentPath !== `/artisti/${slug}` ? currentPath : null;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // AD-29: if slug was renamed, don't generate metadata — the page will 301
  const redirectTarget = await resolveRedirect(slug);
  if (redirectTarget) return {};

  const artist = await getArtistBySlug(slug);
  if (!artist) return {};

  return generateMeta({
    title: `${artist.nameRo} — Artist pentru Evenimente`,
    description: artist.seoDescRo || artist.descriptionRo?.substring(0, 155) || "",
    entity: artist,
    path: `/artisti/${slug}`,
  });
}

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params;

  // AD-29: check if this slug has been superseded by a newer one
  const redirectTarget = await resolveRedirect(slug);
  if (redirectTarget) permanentRedirect(redirectTarget);

  const artist = await getArtistBySlug(slug);
  if (!artist) notFound();

  // M0a #8 — server-side gate: redact price, phone, email and social handles
  // when the visitor is not authenticated so the data never reaches the DOM.
  const { userId } = await auth();
  // Phone is never shown publicly — only in admin panel
  const gatedArtist = userId
    ? { ...artist, phone: null }
    : {
        ...artist,
        priceFrom: null,
        phone: null,
        email: null,
        instagram: null,
        facebook: null,
        tiktok: null,
        youtube: null,
        website: null,
      };

  const [similar, ugcPhotos] = await Promise.all([
    getSimilarArtists(artist.id, artist.categoryIds ?? [], 4),
    getUgcPhotosForArtist(artist.id, 12),
  ]);
  const gatedSimilar = userId
    ? similar
    : similar.map((a) => ({ ...a, priceFrom: null }));

  const name = getLocalized(artist, "name", "ro");
  const desc = getLocalized(artist, "description", "ro");

  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Artiști", url: "/artisti" },
    { name, url: `/artisti/${slug}` },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(artistJsonLd({
            name,
            description: desc,
            slug,
            ratingAvg: artist.ratingAvg ?? undefined,
            ratingCount: artist.ratingCount ?? undefined,
          })),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <ArtistDetailClient
        artist={gatedArtist}
        similar={gatedSimilar}
        ugcPhotos={ugcPhotos.map((p) => ({
          id: p.id,
          url: p.url,
          caption: p.caption,
        }))}
      />
      <ViewTracker kind="artist" id={artist.id} />
    </>
  );
}
