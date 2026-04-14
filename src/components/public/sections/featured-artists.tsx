"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArtistCard } from "@/components/public/artist-card";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  /* Auto-scroll every 4s */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();

    const interval = setInterval(() => {
      if (!el) return;
      const cardW = el.firstElementChild?.clientWidth ?? 300;
      const gap = 16;
      const next = el.scrollLeft + cardW + gap;
      if (next + el.clientWidth >= el.scrollWidth) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: cardW + gap, behavior: "smooth" });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [checkScroll]);

  function scroll(dir: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    const cardW = el.firstElementChild?.clientWidth ?? 300;
    const gap = 16;
    el.scrollBy({ left: dir === "left" ? -(cardW + gap) : cardW + gap, behavior: "smooth" });
  }

  if (!artists.length) return null;

  return (
    <section className="py-16 relative">
      {/* Parallax background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img src="/images/backgrounds/confetti-party.jpg" alt="" className="w-full h-full object-cover opacity-[0.06] blur-[2px] parallax-bg" loading="lazy" />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="mb-1 text-sm font-medium uppercase tracking-[3px] text-gold">Top artiști</p>
            <h2 className="font-heading text-3xl font-bold">{t("nav.artists")}</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Carousel nav arrows */}
            <button
              onClick={() => scroll("left")}
              disabled={!canScrollLeft}
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-full border border-gold/30 text-gold transition hover:bg-gold/10 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => scroll("right")}
              disabled={!canScrollRight}
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-full border border-gold/30 text-gold transition hover:bg-gold/10 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <Link href="/artisti">
              <Button variant="outline" className="border-gold text-gold hover:bg-gold/10 gap-2">
                {t("common.viewAll")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Carousel scroll container */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {artists.map((artist) => (
            <div key={artist.id} className="flex-shrink-0 w-[280px] sm:w-[300px] snap-start">
              <ArtistCard artist={artist} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
