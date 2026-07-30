"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

export function HeroSection() {
  const { t } = useLocale();

  // NOTE: the section deliberately has no `overflow-hidden` — the search bar's
  // calendar popover opens downward past the hero's bottom edge, and clipping
  // the section would cut it in half. The background layers are all `inset-0`
  // (exactly section-sized), so nothing overflows anyway.
  return (
    <section className="relative flex min-h-[690px] items-center -mt-16 pt-16 lg:min-h-[760px]">
      {/* Video/Image Background — kept as-is per design */}
      <div className="absolute inset-0">
        {/* Gradient overlay — always visible */}
        <div className="absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(2,6,13,.94)_0%,rgba(2,6,13,.82)_40%,rgba(2,6,13,.32)_73%,rgba(2,6,13,.52)_100%)]" />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/42 via-transparent to-[#07090e]" />
        {/* Radial gold glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gold/8 via-transparent to-transparent z-10" />
        {/* Background video (desktop) / image (mobile) */}
        <video
          autoPlay
          muted
          loop
          playsInline
          poster="/images/backgrounds/concert-lights.jpg"
          className="absolute inset-0 w-full h-full object-cover hidden md:block"
        >
          <source src="/videos/hero-wedding.mp4" type="video/mp4" />
        </video>
        <Image
          src="/images/backgrounds/concert-lights.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover md:hidden"
        />
      </div>

      <div className="relative z-20 mx-auto w-full max-w-7xl px-4 py-24 text-left lg:px-8">
        <ScrollReveal>
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[.32em] text-[#e8bd5a] sm:text-xs">
            {t("hero.subtitle")}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <h1 className="max-w-3xl font-heading text-4xl font-semibold leading-[1.05] text-[#FAF8F2] sm:text-5xl md:text-6xl lg:text-[68px]">
            {t("hero.title")}
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={0.3}>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[#D4D4E0] sm:text-lg">
            {t("hero.description")}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.45}>
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
        </ScrollReveal>
      </div>
    </section>
  );
}
