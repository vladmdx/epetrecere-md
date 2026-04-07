"use client";

import Link from "next/link";
import { Star, BadgeCheck, Crown, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";

interface ArtistCardProps {
  artist: {
    id: number;
    slug: string;
    nameRo: string;
    nameRu: string | null;
    nameEn: string | null;
    descriptionRo: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    priceFrom: number | null;
    priceCurrency: string | null;
    ratingAvg: number | null;
    ratingCount: number | null;
    isVerified: boolean;
    isFeatured: boolean;
    isPremium: boolean;
    location: string | null;
  };
}

export function ArtistCard({ artist }: ArtistCardProps) {
  const { locale, t } = useLocale();
  const name = getLocalized(artist, "name", locale);
  const description = getLocalized(artist, "description", locale);

  return (
    <Link
      href={`/artisti/${artist.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card transition-all duration-300 hover:border-gold/30 hover:shadow-[0_4px_20px_rgba(201,168,76,0.15)] hover:-translate-y-1"
    >
      {/* Placeholder image */}
      <div className="relative aspect-[4/3] bg-muted">
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <span className="text-4xl">🎵</span>
        </div>
        {/* Badges */}
        <div className="absolute left-2 top-2 flex gap-1">
          {artist.isVerified && (
            <Badge className="bg-gold/90 text-background text-xs gap-1">
              <BadgeCheck className="h-3 w-3" /> Verificat
            </Badge>
          )}
          {artist.isPremium && (
            <Badge className="bg-amber-600/90 text-white text-xs gap-1">
              <Crown className="h-3 w-3" /> Premium
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-heading text-base font-bold line-clamp-1">
          {name}
        </h3>

        {description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
            <span className="text-xs font-medium">
              {artist.ratingAvg ? artist.ratingAvg.toFixed(1) : "—"}
            </span>
            {artist.ratingCount ? (
              <span className="text-xs text-muted-foreground">
                ({artist.ratingCount})
              </span>
            ) : null}
          </div>

          {/* Price */}
          {artist.priceFrom && (
            <p className="font-accent text-sm font-semibold text-gold">
              {t("common.from")} {artist.priceFrom}€
            </p>
          )}
        </div>

        {artist.location && (
          <p className="mt-1 text-xs text-muted-foreground">
            📍 {artist.location}
          </p>
        )}
      </div>
    </Link>
  );
}
