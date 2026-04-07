"use client";

import Link from "next/link";
import { Star, Users, MapPin } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";

interface VenueCardProps {
  venue: {
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
  };
}

export function VenueCard({ venue }: VenueCardProps) {
  const { locale, t } = useLocale();
  const name = getLocalized(venue, "name", locale);

  return (
    <Link
      href={`/sali/${venue.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card transition-all duration-300 hover:border-gold/30 hover:shadow-[0_4px_20px_rgba(201,168,76,0.15)] hover:-translate-y-1"
    >
      <div className="relative aspect-[16/10] bg-muted">
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <span className="text-4xl">🏛️</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-heading text-base font-bold line-clamp-1">{name}</h3>

        {venue.city && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {venue.city}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {venue.capacityMax && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {venue.capacityMin ? `${venue.capacityMin}–` : ""}
                {venue.capacityMax} {t("common.guests")}
              </span>
            )}
            {venue.ratingAvg ? (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-gold text-gold" />
                {venue.ratingAvg.toFixed(1)}
              </span>
            ) : null}
          </div>

          {venue.pricePerPerson && (
            <p className="font-accent text-sm font-semibold text-gold">
              {venue.pricePerPerson}€ {t("common.perPerson")}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
