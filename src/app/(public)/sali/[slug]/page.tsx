import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  venueMenuCategories,
  venueMenuItems,
  venueMenuPackages,
} from "@/lib/db/schema";
import { getVenueBySlug } from "@/lib/db/queries/venues";
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
  const venue = await getVenueBySlug(slug);
  if (!venue) return {};

  return generateMeta({
    title: `${venue.nameRo} — Sală Evenimente`,
    description: venue.seoDescRo || venue.descriptionRo?.substring(0, 155) || "",
    entity: venue,
    path: `/sali/${slug}`,
  });
}

export default async function VenuePage({ params }: Props) {
  const { slug } = await params;
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
