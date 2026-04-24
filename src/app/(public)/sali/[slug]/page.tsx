import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  venueMenuCategories,
  venueMenuItems,
  venueMenuPackages,
  redirects,
} from "@/lib/db/schema";
import { getVenueBySlug } from "@/lib/db/queries/venues";

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
import { getLocalized } from "@/i18n";
import { VenueDetailClient } from "./client";
import { ViewTracker } from "@/components/public/view-tracker";

interface Props {
  params: Promise<{ slug: string }>;
}


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // Check redirects first — if slug was renamed, don't build metadata
  // (page will 308 anyway; serving the target's canonical is enough).
  const redirectTarget = await resolveLegacySlug(slug);
  if (redirectTarget) return { alternates: { canonical: redirectTarget } };

  const venue = await getVenueBySlug(slug);
  if (!venue) return {};

  // Prefer explicit OG URL; fall back to the cover image from the gallery.
  const coverImage = venue.images?.find((i) => i.isCover) ?? venue.images?.[0];
  const image = venue.ogImageUrl ?? coverImage?.url ?? undefined;

  return generateMeta({
    title: `${venue.nameRo} — Sală Evenimente`,
    description: venue.seoDescRo || venue.descriptionRo?.substring(0, 155) || "",
    entity: venue,
    path: `/sali/${slug}`,
    image,
    type: "profile",
  });
}

export default async function VenuePage({ params }: Props) {
  const { slug } = await params;

  // Check redirects FIRST — if slug was renamed, 308 to the new path
  // before loading any venue data.
  const redirectTarget = await resolveLegacySlug(slug);
  if (redirectTarget) permanentRedirect(redirectTarget);

  const venue = await getVenueBySlug(slug);
  if (!venue) notFound();

  // M0a #8 — redact price/phone/email/website for unauthenticated visitors.
  const { userId } = await auth();
  const gatedVenue = userId
    ? venue
    : {
        ...venue,
        pricePerPerson: null,
        phone: null,
        email: null,
        website: null,
      };

  const name = getLocalized(venue, "name", "ro");

  // Load digital menu data (packages, categories, items)
  const [menuCategories, menuPackages] = await Promise.all([
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
  ]);

  const catIds = menuCategories.map((c) => c.id);
  const menuItems =
    catIds.length > 0
      ? await db
          .select()
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
            { name: "Acasă", url: "/" },
            { name: "Săli", url: "/sali" },
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
      />
      <ViewTracker kind="venue" id={venue.id} />
    </>
  );
}
