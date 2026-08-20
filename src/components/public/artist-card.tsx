"use client";

import Link from "@/components/shared/locale-link";
import Image from "next/image";
import { Star, BadgeCheck, Crown, Lock, MapPin } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { WishlistButton } from "@/components/public/wishlist-button";
import { CompareButton } from "@/components/public/compare-button";
import { resolveArtistCoverImage } from "@/lib/artists/demo-images";
import { formatPrice } from "@/lib/format/price";

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
    coverImageUrl?: string | null;
  };
}

export function ArtistCard({ artist }: ArtistCardProps) {
  const { locale, t } = useLocale();
  const { isSignedIn, isLoaded } = useUser();
  const name = getLocalized(artist, "name", locale);
  const description = getLocalized(artist, "description", locale);
  // Price is gated behind login (M0a #8). We only show the locked pill once
  // Clerk has hydrated so we don't flash a "Lock" state for authed users.
  const showPrice = isLoaded && isSignedIn;
  const image = resolveArtistCoverImage(artist.slug, artist.coverImageUrl);

  return (
    <Link
      href={`/artisti/${artist.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-white/8 bg-[#111522] transition-all duration-300 hover:-translate-y-1 hover:border-[#e6b84d]/45 hover:shadow-[0_18px_38px_rgba(0,0,0,.28)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[#0a0d14]">
        {image ? (
          <Image
            src={image}
            alt={name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover object-[center_20%] transition-transform duration-500 group-hover:scale-105"
            unoptimized={image.includes("r2.cloudflarestorage.com")}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(230,184,77,.16),transparent_35%),linear-gradient(145deg,#131927,#080b11)]">
            <span className="font-heading text-5xl font-semibold text-gold/55">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#111522] to-transparent" />
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[#06110d]/85 px-2 py-1 text-[9px] font-medium text-[#53df86] backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4fe47f]" />
          Disponibil
        </span>
        {/* Badges */}
        <div className="absolute left-2 top-2 flex gap-1">
          {artist.isVerified && (
            <Badge className="gap-1 bg-gold/90 text-[9px] text-[#0D0D0D]">
              <BadgeCheck className="h-3 w-3" /> Verificat
            </Badge>
          )}
          {artist.isPremium && (
            <Badge className="bg-amber-600/90 text-white text-xs gap-1">
              <Crown className="h-3 w-3" /> Premium
            </Badge>
          )}
        </div>
        {/* Wishlist heart + Compare — positioned top-right, stacked */}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
          <WishlistButton entityName={name}
            entityType="artist"
            entityId={artist.id}
            size="sm"
            className="bg-background/80 backdrop-blur-sm"
          />
          <CompareButton entityName={name} entityType="artist" entityId={artist.id} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-1 font-heading text-base font-semibold text-white">
          {name}
        </h3>

        {description && (
          <p className="mt-0.5 line-clamp-1 text-[10px] text-white/50">
            {description.replace(/<[^>]+>/g, "")}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-white/7 pt-2">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
            <span className="text-xs font-medium text-white/84">
              {artist.ratingAvg ? artist.ratingAvg.toFixed(1) : "—"}
            </span>
            {artist.ratingCount ? (
              <span className="text-[10px] text-white/38">
                ({artist.ratingCount})
              </span>
            ) : null}
          </div>

          {/* Price — gated behind login */}
          {artist.priceFrom ? (
            showPrice ? (
              <p className="text-[10px] font-semibold text-white/76">
                {t("common.from")} {formatPrice(artist.priceFrom, artist.priceCurrency, locale)}
              </p>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold/90">
                <Lock className="h-3 w-3" /> Preț la autentificare
              </span>
            )
          ) : null}
        </div>

        {artist.location && (
          <p className="mt-2 flex items-center gap-1 text-[10px] text-white/47">
            <MapPin className="h-3 w-3 text-[#e6b84d]" /> {artist.location}
          </p>
        )}
      </div>
    </Link>
  );
}
