"use client";

import Link from "@/components/shared/locale-link";
import Image from "next/image";
import { Star, Users, MapPin, Lock, BadgeCheck } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { WishlistButton } from "@/components/public/wishlist-button";
import { CompareButton } from "@/components/public/compare-button";
import { formatPrice } from "@/lib/format/price";

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
    coverImageUrl?: string | null;
  };
  imageIndex?: number;
  /**
   * The date the list was filtered on (YYYY-MM-DD). Only then may the card
   * claim availability: getVenues({ availableDate }) drops every venue booked
   * or blocked on it, so "in this result set" means "free on that day".
   * Without a date nothing is known, so the badge stays hidden.
   */
  availableOn?: string | null;
}

export function VenueCard({ venue, imageIndex, availableOn }: VenueCardProps) {
  const { locale, t } = useLocale();
  const { isSignedIn, isLoaded } = useUser();
  const name = getLocalized(venue, "name", locale);
  const showPrice = isLoaded && isSignedIn;
  const fallbackIndex = imageIndex ?? venue.id;
  const image = venue.coverImageUrl || `/images/venues/hall-${(fallbackIndex % 6) + 1}.jpg`;

  return (
    <Link
      href={`/sali/${venue.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-white/8 bg-[#111522] transition-all duration-300 hover:-translate-y-1 hover:border-[#e6b84d]/45 hover:shadow-[0_18px_38px_rgba(0,0,0,.28)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#0a0d14]">
        <Image
          src={image}
          alt={name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          unoptimized={image.includes("r2.cloudflarestorage.com")}
        />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#111522] to-transparent" />
        {availableOn && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[#06110d]/85 px-2 py-1 text-[9px] font-medium text-[#53df86] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4fe47f]" />
            {t("venue.card.available")}
          </span>
        )}
        {venue.isFeatured && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#e6b84d]/92 px-2 py-1 text-[9px] font-semibold text-[#07101d]">
            <BadgeCheck className="h-3 w-3" /> {t("venue.card.featured")}
          </span>
        )}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
          <WishlistButton entityName={name}
            entityType="venue"
            entityId={venue.id}
            size="sm"
            className="bg-background/80 backdrop-blur-sm"
          />
          <CompareButton entityName={name} entityType="venue" entityId={venue.id} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-1 font-heading text-base font-semibold text-white">{name}</h3>

        {venue.city && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-white/47">
            <MapPin className="h-3 w-3 text-[#e6b84d]" /> {venue.city}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-white/7 pt-2">
          <div className="flex items-center gap-3 text-[10px] text-white/48">
            {venue.capacityMax && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {venue.capacityMin ? `${venue.capacityMin}–` : ""}
                {venue.capacityMax} {t("common.guests")}
              </span>
            )}
            {venue.ratingAvg ? (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-[#e6b84d] text-[#e6b84d]" />
                {venue.ratingAvg.toFixed(1)}
              </span>
            ) : <span className="text-[#e6b84d]/70">{t("venue.card.newVenue")}</span>}
          </div>

          {venue.pricePerPerson ? (
            showPrice ? (
              <p className="text-[10px] font-semibold text-white/76">
                {formatPrice(venue.pricePerPerson, null, locale)} {t("common.perPerson")}
              </p>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold/90">
                <Lock className="h-3 w-3" /> {t("common.priceOnLogin")}
              </span>
            )
          ) : null}
        </div>
      </div>
    </Link>
  );
}
