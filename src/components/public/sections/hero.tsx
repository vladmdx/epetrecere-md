"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { HeroSearch } from "@/components/public/hero-search";

export function HeroSection() {
  const { t } = useLocale();

  return (
    <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden -mt-16 pt-16">
      {/* Video/Image Background — kept as-is per design */}
      <div className="absolute inset-0">
        {/* Gradient overlay — always visible */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-[#0D0D0D] z-10" />
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

      <div className="relative z-20 mx-auto w-full max-w-6xl px-4 py-24 text-center lg:px-8">
        <ScrollReveal>
          <p className="mb-5 text-xs font-semibold uppercase tracking-[4px] text-gold sm:text-sm">
            {t("hero.subtitle")}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <h1 className="mx-auto max-w-4xl font-heading text-4xl font-bold leading-[1.08] text-[#FAF8F2] sm:text-5xl md:text-6xl lg:text-[64px]">
            {t("hero.title")}
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={0.3}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#D4D4E0] sm:text-lg">
            {t("hero.description")}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.45}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link href="/planifica">
              <Button size="lg" className="bg-gold text-[#0D0D0D] hover:bg-gold-dark px-8 text-base font-semibold shadow-[0_4px_20px_rgba(201,168,76,0.3)]">
                {t("hero.cta_primary")}
              </Button>
            </Link>
            <Link href="/artisti">
              <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:border-gold hover:bg-gold/10 hover:text-gold px-8 text-base backdrop-blur-sm">
                {t("hero.cta_secondary")}
              </Button>
            </Link>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.6}>
          <div className="mt-12">
            <HeroSearch />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
