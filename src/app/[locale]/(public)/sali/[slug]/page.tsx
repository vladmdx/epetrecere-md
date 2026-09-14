import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { redirects } from "@/lib/db/schema";
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
import { localizePath } from "@/lib/i18n/routing";
import { parseCatalogFilters } from "@/lib/venues/catalog-filters";
import { resolveSelectedHall } from "@/lib/venues/hall-selection";
import { getVenueMenuForHall } from "@/lib/venues/menu-query";
import { VenueDetailClient } from "./client";
import { ViewTracker } from "@/components/public/view-tracker";

interface Props {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}


/** Publication can be withdrawn immediately. Do not serve an hour-old
 * profile, booking CTA or metadata after the active flag changes. */
export const revalidate = 0;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  // Check redirects first — if slug was renamed, don't build metadata
  // (page will 308 anyway; serving the target's canonical is enough).
  const redirectTarget = await resolveLegacySlug(slug);
  if (redirectTarget) return { alternates: { canonical: redirectTarget } };

  const venue = publicCatalogData(await getVenueBySlug(slug), false);
  if (!venue?.isActive) return { robots: { index: false, follow: false } };

  // Prefer explicit OG URL; fall back to the cover image from the gallery.
  const coverImage = venue.images?.find((i) => i.isCover) ?? venue.images?.[0];
  const image = ("ogImageUrl" in venue && typeof venue.ogImageUrl === "string"
    ? venue.ogImageUrl
    : undefined) ?? coverImage?.url ?? undefined;

  // The venue's name is data — only the words around it are translated.
  const name = getLocalized(venue, "name", locale);

  // The venue's own description is the better snippet when it exists in this
  // language; the sentence below is what a venue without one gets, instead of
  // the Romanian excerpt every locale used to receive. Admin seo_desc_* still
  // wins — generateMeta applies it for this locale only.
  const excerpt = plainText({
    ro: venue.descriptionRo,
    ru: venue.descriptionRu,
    en: venue.descriptionEn,
  }[locale]).substring(0, 155);

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
    entity: publicCatalogData(venue, false),
    path: `/sali/${slug}`,
    image,
    type: "profile",
    locale,
  });
}

export default async function VenuePage({ params, searchParams }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const sp = await searchParams;
  const param = (key: string) => {
    const value = sp[key];
    return typeof value === "string" ? value : undefined;
  };

  // Check redirects FIRST — if slug was renamed, 308 to the new path
  // before loading any venue data.
  const redirectTarget = await resolveLegacySlug(slug);
  if (redirectTarget) permanentRedirect(redirectTarget);

  const parsedFilters = parseCatalogFilters({
    guest_count: param("guest_count") || param("guests") || param("capacity_min"),
    date: param("date"),
    start: param("start") || param("start_time"),
    end: param("end") || param("end_time"),
  });
  const venue = await getVenueBySlug(slug, {
    guestCount: parsedFilters.guestCount,
    availableDate: parsedFilters.date,
    startTime: parsedFilters.startTime,
    endTime: parsedFilters.endTime,
    revealPrices: false,
  });
  if (!venue?.isActive) notFound();

  // Always the anonymous shape. Signed-in extras arrive from
  // /api/public/gated-details in the browser.
  const gatedVenue = publicCatalogData(venue);

  const name = getLocalized(gatedVenue, "name", locale);
  const publicHalls = "halls" in gatedVenue && Array.isArray(gatedVenue.halls)
    ? gatedVenue.halls
    : [];
  const initialHall = resolveSelectedHall({
    halls: publicHalls,
    requestedSlug: param("hall"),
    intervalComplete: parsedFilters.intervalComplete,
  });

  // The selected Hall's explicit menu set wins; otherwise it inherits the
  // venue default set. Prices are redacted below for the anonymous RSC.
  const [menu, relatedResult] = await Promise.all([
    getVenueMenuForHall(venue.id, initialHall.hallId),
    getVenues({
      city: venue.city || undefined,
      limit: 5,
      sort: "rating",
    }),
  ]);

  const jsonLdHalls = "halls" in gatedVenue && Array.isArray(gatedVenue.halls)
    ? gatedVenue.halls.map((hall) => ({
      slug: hall.slug,
      name: getLocalized(hall, "name", locale) || hall.nameRo,
    }))
    : undefined;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(venueJsonLd({
            name,
            description: getLocalized(gatedVenue, "description", locale),
            slug,
            address: venue.address ?? undefined,
            city: venue.city ?? undefined,
            locale,
            halls: jsonLdHalls,
          })),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd([
            { name: t("nav.home", locale), url: localizePath("/", locale) },
            { name: t("venuesPage.breadcrumb", locale), url: localizePath("/sali", locale) },
            { name, url: localizePath(`/sali/${slug}`, locale) },
          ])),
        }}
      />
      <VenueDetailClient
        venue={gatedVenue}
        requestedHallSlug={param("hall") ?? null}
        intervalComplete={parsedFilters.intervalComplete}
        guestCount={parsedFilters.guestCount ?? null}
        eventDate={parsedFilters.date ?? null}
        startTime={parsedFilters.startTime ?? null}
        endTime={parsedFilters.endTime ?? null}
        menu={publicCatalogData(menu)}
        similar={relatedResult.items
          .filter((item) => item.id !== venue.id)
          .slice(0, 4)
          .map((item) => publicCatalogData(item))}
      />
      <ViewTracker kind="venue" id={venue.id} />
    </>
  );
}
import { plainText } from "@/lib/content/plain-text";
import { publicCatalogData } from "@/lib/privacy/public-catalog";
