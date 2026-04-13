import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
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

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
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
