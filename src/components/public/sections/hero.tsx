"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

const stats = [
  { key: "stats_artists", value: "500+" },
  { key: "stats_events", value: "200+" },
  { key: "stats_years", value: "12" },
];

export function HeroSection() {
  const { t } = useLocale();

  return (
    <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden -mt-16 pt-16">
      {/* Video/Image Background */}
      <div className="absolute inset-0">
        {/* Gradient overlay — always visible */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-[#0D0D0D] z-10" />
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
        <img src="/images/backgrounds/concert-lights.jpg" alt="" className="absolute inset-0 w-full h-full object-cover md:hidden" loading="eager" />
      </div>

      <div className="relative z-20 mx-auto max-w-7xl px-4 py-24 text-center lg:px-8">
        <ScrollReveal>
          <p className="mb-4 text-sm font-medium uppercase tracking-[4px] text-gold">
            {t("hero.subtitle")}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <h1 className="mx-auto max-w-4xl font-heading text-4xl font-bold leading-tight text-[#FAF8F2] md:text-5xl lg:text-6xl">
            {t("hero.title")}
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={0.3}>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[#D4D4E0]">
            {t("hero.description")}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.45}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/artisti">
              <Button size="lg" className="bg-gold text-background hover:bg-gold-dark px-8 text-base font-medium shadow-[0_4px_20px_rgba(201,168,76,0.3)]">
                {t("hero.cta_primary")}
              </Button>
            </Link>
            <Link href="/planifica">
              <Button size="lg" variant="outline" className="border-gold text-gold hover:bg-gold/10 px-8 text-base">
                {t("hero.cta_secondary")}
              </Button>
            </Link>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.6}>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {stats.map((stat) => (
              <div key={stat.key} className="text-center">
                <p className="font-accent text-3xl font-semibold text-gold md:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-[#D4D4E0]">
                  {t(`hero.${stat.key}`)}
                </p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
