import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, redirects } from "@/lib/db/schema";
import {
  getArtistBySlug,
  getSimilarArtists,
  getUgcPhotosForArtist,
} from "@/lib/db/queries/artists";
import { generateMeta } from "@/lib/seo/generate-meta";
import { artistJsonLd, breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { getLocalized, t } from "@/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { ArtistDetailClient } from "./client";
import { ViewTracker } from "@/components/public/view-tracker";
import { LOCALES } from "@/lib/i18n/routing";

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
  params: Promise<{ locale: string; slug: string }>;
}

/** Publication can be withdrawn immediately. Do not serve an hour-old
 * profile, booking CTA or metadata after the active flag changes. */
export const revalidate = 0;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;

  // AD-29: if slug was renamed, don't generate metadata — the page will 301
  const redirectTarget = await resolveRedirect(slug);
  if (redirectTarget) return {};

  const artist = publicCatalogData(await getArtistBySlug(slug), true);
  if (!artist?.isActive) return { robots: { index: false, follow: false } };

  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  // The artist's name is data — only the words around it are translated.
  const name = getLocalized(artist, "name", locale);

  // The profile's own description is the better snippet when it exists in
  // this language; the sentence below is what a profile without one gets,
  // instead of the Romanian excerpt every locale used to receive. Admin
  // seo_desc_* still wins — generateMeta applies it for this locale only.
  const excerpt = profileDescriptionSummary({
    ro: artist.descriptionRo,
    ru: artist.descriptionRu,
    en: artist.descriptionEn,
  }[locale]).substring(0, 155);

  const fallback = {
    ro: {
      title: `${name} — Artist pentru Evenimente`,
      description: `${name} — profil, prețuri, video și recenzii. Verifică datele libere și rezervă online pe ePetrecere.md.`,
    },
    ru: {
      title: `${name} — артист на праздник`,
      description: `${name} — анкета, цены, видео и отзывы. Проверьте свободные даты и забронируйте онлайн на ePetrecere.md.`,
    },
    en: {
      title: `${name} — Event Artist`,
      description: `${name} — profile, prices, videos and reviews. Check available dates and book online on ePetrecere.md.`,
    },
  }[locale];

  return generateMeta({
    title: fallback.title,
    description: excerpt || fallback.description,
    entity: publicCatalogData(artist, true),
    path: `/artisti/${slug}`,
    locale,
  });
}

export default async function ArtistPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  // AD-29: check if this slug has been superseded by a newer one
  const redirectTarget = await resolveRedirect(slug);
  if (redirectTarget) permanentRedirect(redirectTarget);

  const artist = await getArtistBySlug(slug);
  if (!artist?.isActive) notFound();

  // Always the anonymous shape. Signed-in visitors get withheld fields from
  // /api/public/gated-details once the page is interactive.
  //
  // Phone and e-mail stay null for everyone: they are admin-only, and
  // clients are meant to reach an artist through the platform.
  const gatedArtist = publicCatalogData(artist);

  const [similar, ugcPhotos] = await Promise.all([
    getSimilarArtists(artist.id, artist.categoryIds ?? [], 4),
    getUgcPhotosForArtist(artist.id, 12),
  ]);
  const gatedSimilar = publicCatalogData(similar);

  const name = getLocalized(gatedArtist, "name", locale);
  const desc = getLocalized(gatedArtist, "description", locale);

  const breadcrumbs = [
    { name: t("nav.home", locale), url: "/" },
    { name: t("nav.artists", locale), url: "/artisti" },
    { name, url: `/artisti/${slug}` },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(artistJsonLd({
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
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd(breadcrumbs)) }}
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
import { profileDescriptionSummary } from "@/lib/content/profile-description-summary";
import { publicCatalogData } from "@/lib/privacy/public-catalog";
