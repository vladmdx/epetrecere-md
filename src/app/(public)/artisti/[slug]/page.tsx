import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArtistBySlug, getSimilarArtists } from "@/lib/db/queries/artists";
import { generateMeta } from "@/lib/seo/generate-meta";
import { artistJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { getLocalized } from "@/i18n";
import { ArtistDetailClient } from "./client";

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

  const similar = await getSimilarArtists(artist.id, artist.categoryIds ?? [], 4);

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
      <ArtistDetailClient artist={artist} similar={similar} />
    </>
  );
}
