import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { redirects, venueMenuCategories, venueMenuItems, venueMenuPackages, venues } from "@/lib/db/schema";
import { getVenueBySlug, getVenues } from "@/lib/db/queries/venues";

/** When a venue slug is not found, check the redirects table — the
 *  owner may have renamed their slug and we inserted a 301 row. Follows
 *  the redirect chain up to 5 hops to guard against cycles. Mirrors
 *  AD-29 on the artist page. */
async function resolveLegacySlug(slug: string): Promise<string | null> {
  let currentPath = `/sali/${slug}`;
  for (let i = 0; i < 5; i++) {
    const [row] = await db
      .select({ toPath: redirects.toPath })
      .from(redirects)
      .where(eq(redirects.fromPath, currentPath))
      .limit(1);
    if (!row) break;
    currentPath = row.toPath;
  }
  return currentPath === `/sali/${slug}` ? null : currentPath;
}
import { generateMeta } from "@/lib/seo/generate-meta";
import { venueJsonLd, breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { getLocalized, t } from "@/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { VenueDetailClient } from "./client";
import { ViewTracker } from "@/components/public/view-tracker";
import { LOCALES } from "@/lib/i18n/routing";

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}


/**
 * Prerender the venue profiles at build time, one page per language. New rows
 * added after a deploy still work — dynamicParams defaults to true, so an
 * unknown slug renders on demand and is cached from then on.
 */
export async function generateStaticParams() {
  const rows = await db
    .select({ slug: venues.slug })
    .from(venues)
    .where(eq(venues.isActive, true));
  return LOCALES.flatMap((locale) =>
    rows.map((r) => ({ locale, slug: r.slug })),
  );
}

/** Rebuild a profile at most hourly; owners edit these rarely. */
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  // Check redirects first — if slug was renamed, don't build metadata
  // (page will 308 anyway; serving the target's canonical is enough).
  const redirectTarget = await resolveLegacySlug(slug);
  if (redirectTarget) return { alternates: { canonical: redirectTarget } };

  const venue = await getVenueBySlug(slug);
  if (!venue) return {};

  // Prefer explicit OG URL; fall back to the cover image from the gallery.
  const coverImage = venue.images?.find((i) => i.isCover) ?? venue.images?.[0];
  const image = venue.ogImageUrl ?? coverImage?.url ?? undefined;

  // The venue's name is data — only the words around it are translated.
  const name = getLocalized(venue, "name", locale);

  // The venue's own description is the better snippet when it exists in this
  // language; the sentence below is what a venue without one gets, instead of
  // the Romanian excerpt every locale used to receive. Admin seo_desc_* still
  // wins — generateMeta applies it for this locale only.
  const excerpt = {
    ro: venue.descriptionRo,
    ru: venue.descriptionRu,
    en: venue.descriptionEn,
  }[locale]?.substring(0, 155);

  const fallback = {
    ro: {
      title: `${name} — Sală Evenimente`,
      description: `${name} — capacitate, preț pe persoană, meniu și galerie foto. Verifică datele libere și rezervă online pe ePetrecere.md.`,
    },
    ru: {
      title: `${name} — зал для торжеств`,
      description: `${name} — вместимость, цена на человека, меню и фотогалерея. Узнайте свободные даты и забронируйте онлайн на ePetrecere.md.`,
    },
    en: {
      title: `${name} — Event Venue`,
      description: `${name} — capacity, price per guest, menu and photo gallery. Check free dates and book online on ePetrecere.md.`,
    },
  }[locale];

  return generateMeta({
    title: fallback.title,
    description: excerpt || fallback.description,
    entity: venue,
    path: `/sali/${slug}`,
    image,
    type: "profile",
    locale,
  });
}

export default async function VenuePage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  // Check redirects FIRST — if slug was renamed, 308 to the new path
  // before loading any venue data.
  const redirectTarget = await resolveLegacySlug(slug);
  if (redirectTarget) permanentRedirect(redirectTarget);

  const venue = await getVenueBySlug(slug);
  if (!venue) notFound();

  // Always the anonymous shape — see the note on the artist page. Reading
  // the session here would keep this route out of the prerender, and the
  // signed-in extras arrive from /api/public/gated-details in the browser.
  const gatedVenue = {
    ...venue,
    pricePerPerson: null,
    phone: null,
    email: null,
    website: null,
  };

  const name = getLocalized(venue, "name", "ro");

  // Load digital menu data (packages, categories, items)
  const [menuCategories, menuPackages, relatedResult] = await Promise.all([
    db
      .select()
      .from(venueMenuCategories)
      .where(eq(venueMenuCategories.venueId, venue.id))
      .orderBy(asc(venueMenuCategories.sortOrder), asc(venueMenuCategories.id)),
    db
      .select()
      .from(venueMenuPackages)
      .where(eq(venueMenuPackages.venueId, venue.id))
      .orderBy(asc(venueMenuPackages.sortOrder), asc(venueMenuPackages.id)),
    getVenues({
      city: venue.city || undefined,
      limit: 5,
      sort: "rating",
    }),
  ]);

  const catIds = menuCategories.map((c) => c.id);
  const menuItems =
    catIds.length > 0
      ? await db
          .select({
            id: venueMenuItems.id,
            categoryId: venueMenuItems.categoryId,
            nameRo: venueMenuItems.nameRo,
            nameRu: venueMenuItems.nameRu,
            nameEn: venueMenuItems.nameEn,
            descriptionRo: venueMenuItems.descriptionRo,
            priceEur: venueMenuItems.priceEur,
            sortOrder: venueMenuItems.sortOrder,
          })
          .from(venueMenuItems)
          .where(inArray(venueMenuItems.categoryId, catIds))
          .orderBy(asc(venueMenuItems.sortOrder), asc(venueMenuItems.id))
      : [];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(venueJsonLd({
            name,
            description: venue.descriptionRo || "",
            slug,
            address: venue.address ?? undefined,
            city: venue.city ?? undefined,
            pricePerPerson: venue.pricePerPerson ?? undefined,
          })),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd([
            { name: t("nav.home", locale), url: "/" },
            { name: t("venuesPage.breadcrumb", locale), url: "/sali" },
            { name, url: `/sali/${slug}` },
          ])),
        }}
      />
      <VenueDetailClient
        venue={gatedVenue}
        menu={{
          categories: menuCategories,
          items: menuItems,
          packages: menuPackages,
        }}
        similar={relatedResult.items
          .filter((item) => item.id !== venue.id)
          .slice(0, 4)
          .map((item) => ({ ...item, pricePerPerson: null }))}
      />
      <ViewTracker kind="venue" id={venue.id} />
    </>
  );
}
