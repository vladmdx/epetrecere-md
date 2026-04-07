"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";

const stats = [
  { key: "stats_artists", value: "500+" },
  { key: "stats_events", value: "200+" },
  { key: "stats_years", value: "12" },
];

export function HeroSection() {
  const { t } = useLocale();

  return (
    <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gold/5 via-transparent to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 py-24 text-center lg:px-8">
        <p className="animate-fade-up mb-4 text-sm font-medium uppercase tracking-[4px] text-gold">
          {t("hero.subtitle")}
        </p>

        <h1 className="animate-fade-up [animation-delay:150ms] mx-auto max-w-4xl font-heading text-4xl font-bold leading-tight md:text-5xl lg:text-6xl">
          {t("hero.title")}
        </h1>

        <p className="animate-fade-up [animation-delay:300ms] mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          {t("hero.description")}
        </p>

        <div className="animate-fade-up [animation-delay:450ms] mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/artisti">
            <Button
              size="lg"
              className="bg-gold text-background hover:bg-gold-dark px-8 text-base font-medium"
            >
              {t("hero.cta_primary")}
            </Button>
          </Link>
          <Link href="/planifica">
            <Button
              size="lg"
              variant="outline"
              className="border-gold text-gold hover:bg-gold/10 px-8 text-base"
            >
              {t("hero.cta_secondary")}
            </Button>
          </Link>
        </div>

        <div className="animate-fade-up [animation-delay:600ms] mt-16 flex flex-wrap items-center justify-center gap-8 md:gap-16">
          {stats.map((stat) => (
            <div key={stat.key} className="text-center">
              <p className="font-accent text-3xl font-semibold text-gold md:text-4xl">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`hero.${stat.key}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
