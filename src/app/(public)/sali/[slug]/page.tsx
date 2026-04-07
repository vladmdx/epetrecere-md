import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getVenueBySlug } from "@/lib/db/queries/venues";
import { generateMeta } from "@/lib/seo/generate-meta";
import { venueJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { getLocalized } from "@/i18n";
import { VenueDetailClient } from "./client";

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

  const name = getLocalized(venue, "name", "ro");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(venueJsonLd({
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
          __html: JSON.stringify(breadcrumbJsonLd([
            { name: "Acasă", url: "/" },
            { name: "Săli", url: "/sali" },
            { name, url: `/sali/${slug}` },
          ])),
        }}
      />
      <VenueDetailClient venue={venue} />
    </>
  );
}
