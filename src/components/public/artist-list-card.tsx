"use client";

// List-view variant of ArtistCard — compact (thumbnail + name + price)
// and detailed (adds description, rating, badges, action buttons).

import Link from "@/components/shared/locale-link";
import Image from "next/image";
import { Star, BadgeCheck, Crown, MapPin, Music, Lock } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { WishlistButton } from "@/components/public/wishlist-button";
import { CompareButton } from "@/components/public/compare-button";
import { cn } from "@/lib/utils";

interface Artist {
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
  coverImageUrl?: string | null;
}

interface Props {
  artist: Artist;
  density: "compact" | "detailed";
}

export function ArtistListCard({ artist, density }: Props) {
  const { locale } = useLocale();
  const { isSignedIn, isLoaded } = useUser();
  const name = getLocalized(artist, "name", locale);
  const description = getLocalized(artist, "description", locale);
  const showPrice = isLoaded && isSignedIn;

  const thumbSize = density === "compact" ? "h-16 w-16" : "h-28 w-28";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/40 bg-card p-3 transition-all hover:border-gold/30",
        density === "detailed" && "gap-4 p-4",
      )}
    >
      <Link
        href={`/artisti/${artist.slug}`}
        className={cn("relative shrink-0 overflow-hidden rounded-lg bg-muted", thumbSize)}
      >
        {artist.coverImageUrl ? (
          <Image
            src={artist.coverImageUrl}
            alt={name}
            fill
            sizes={density === "compact" ? "64px" : "112px"}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Music className={density === "compact" ? "h-5 w-5" : "h-7 w-7"} />
          </div>
        )}
        {artist.isPremium && (
          <span className="absolute left-1 top-1 rounded-full bg-black/70 p-0.5 backdrop-blur-sm">
            <Crown className="h-3 w-3 text-gold" />
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/artisti/${artist.slug}`}
                className="line-clamp-1 font-heading font-bold hover:text-gold"
              >
                {name}
              </Link>
              {artist.isVerified && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-blue-400" />
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {artist.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {artist.location}
                </span>
              )}
              {artist.ratingAvg && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-gold text-gold" />
                  {Number(artist.ratingAvg).toFixed(1)}
                  <span className="opacity-60">({artist.ratingCount ?? 0})</span>
                </span>
              )}
              {showPrice && artist.priceFrom ? (
                <span className="font-medium text-gold">
                  de la {artist.priceFrom} {artist.priceCurrency ?? "EUR"}
                </span>
              ) : !showPrice ? (
                <span className="flex items-center gap-1 text-gold/70">
                  <Lock className="h-3 w-3" />
                  Preț la autentificare
                </span>
              ) : null}
            </div>

            {density === "detailed" && description && (
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                {description.replace(/<[^>]+>/g, "")}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <WishlistButton entityName={name} entityType="artist" entityId={artist.id} />
            {density === "detailed" && (
              <CompareButton entityName={name} entityType="artist" entityId={artist.id} />
            )}
          </div>
        </div>

        {density === "detailed" && (
          <div className="mt-3 flex items-center gap-2">
            <Link
              href={`/artisti/${artist.slug}`}
              className="inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-xs font-medium text-[#0D0D0D] hover:bg-gold-dark"
            >
              Vezi profil
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
