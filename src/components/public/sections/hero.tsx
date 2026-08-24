"use client";

import Link from "@/components/shared/locale-link";
import { Button } from "@/components/ui/button";
import { useBackgroundVideo } from "@/hooks/use-background-video";
import { useLocale } from "@/hooks/use-locale";

const POSTER = "/images/backgrounds/concert-lights.jpg";

export function HeroSection() {
  const { t } = useLocale();
  // Above the fold, so the video may start as soon as the viewport allows it.
  const { ref: bgRef, showVideo } = useBackgroundVideo({ eager: true });

  // NOTE: the section deliberately has no `overflow-hidden` — the search bar's
  // calendar popover opens downward past the hero's bottom edge, and clipping
  // the section would cut it in half. The background layers are all `inset-0`
  // (exactly section-sized), so nothing overflows anyway.
  return (
    <section className="relative -mt-16 flex min-h-screen items-center pt-16">
      {/* Video/Image Background — kept as-is per design */}
      <div ref={bgRef} className="absolute inset-0">
        {/* Gradient overlay — always visible */}
        <div className="absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(2,6,13,.94)_0%,rgba(2,6,13,.82)_40%,rgba(2,6,13,.32)_73%,rgba(2,6,13,.52)_100%)]" />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/42 via-transparent to-[#07090e]" />
        {/* Radial gold glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gold/8 via-transparent to-transparent z-10" />
        {/* The poster is the real background: it paints first everywhere and
            stays underneath, so the video fading in over it never flashes.
            `poster` reuses the same URL, so desktop still fetches one image. */}
        <img
          src={POSTER}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Mounted only on desktop — `hidden md:block` would still make a phone
            download all 16 MB of it. */}
        {showVideo && (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            poster={POSTER}
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src="/videos/hero-wedding.mp4" type="video/mp4" />
          </video>
        )}
      </div>

      <div className="relative z-20 mx-auto w-full max-w-7xl px-4 py-24 text-left lg:px-8">
        <div>
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[.32em] text-[#e8bd5a] sm:text-xs">
            {t("hero.subtitle")}
          </p>
        </div>

        <div>
          <h1 className="max-w-3xl font-heading text-4xl font-semibold leading-[1.05] text-[#FAF8F2] sm:text-5xl md:text-6xl lg:text-[68px]">
            {t("hero.title")}
          </h1>
        </div>

        <div>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[#D4D4E0] sm:text-lg">
            {t("hero.description")}
          </p>
        </div>

        <div>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/planifica">
              <Button size="lg" className="min-h-12 rounded-lg bg-[linear-gradient(135deg,#f2d17b,#d9a63c)] px-8 text-sm font-semibold text-[#07101d] shadow-[0_8px_28px_rgba(201,168,76,.28)] hover:brightness-105">
                {t("hero.cta_primary")}
                <span aria-hidden className="ml-2">→</span>
              </Button>
            </Link>
            <Link href="/artisti">
              <Button size="lg" variant="outline" className="min-h-12 rounded-lg border-white/35 bg-black/18 px-8 text-sm text-white backdrop-blur-sm hover:border-gold hover:bg-gold/10 hover:text-gold">
                {t("hero.cta_secondary")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
