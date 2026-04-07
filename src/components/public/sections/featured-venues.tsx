"use client";

import Link from "next/link";
import { VenueCard } from "@/components/public/venue-card";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { ArrowRight } from "lucide-react";

interface Props {
  venues: Array<{
    id: number;
    slug: string;
    nameRo: string;
    nameRu: string | null;
    nameEn: string | null;
    address: string | null;
    city: string | null;
    capacityMin: number | null;
    capacityMax: number | null;
    pricePerPerson: number | null;
    ratingAvg: number | null;
    ratingCount: number | null;
    isFeatured: boolean;
  }>;
}

export function FeaturedVenuesSection({ venues }: Props) {
  const { t } = useLocale();

  if (!venues.length) return null;

  return (
    <section className="bg-card py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="mb-1 text-sm font-medium uppercase tracking-[3px] text-gold">Locații premium</p>
            <h2 className="font-heading text-3xl font-bold">{t("nav.venues")}</h2>
          </div>
          <Link href="/sali">
            <Button variant="outline" className="border-gold text-gold hover:bg-gold/10 gap-2">
              {t("common.viewAll")} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {venues.map((venue) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </div>
      </div>
    </section>
  );
}
