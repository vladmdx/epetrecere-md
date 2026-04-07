"use client";

import Link from "next/link";
import { ArtistCard } from "@/components/public/artist-card";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { ArrowRight } from "lucide-react";

interface Props {
  artists: Array<{
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
  }>;
}

export function FeaturedArtistsSection({ artists }: Props) {
  const { t } = useLocale();

  if (!artists.length) return null;

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="mb-1 text-sm font-medium uppercase tracking-[3px] text-gold">Top artiști</p>
            <h2 className="font-heading text-3xl font-bold">{t("nav.artists")}</h2>
          </div>
          <Link href="/artisti">
            <Button variant="outline" className="border-gold text-gold hover:bg-gold/10 gap-2">
              {t("common.viewAll")} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      </div>
    </section>
  );
}
