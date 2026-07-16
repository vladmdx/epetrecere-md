"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

export function CTASection() {
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden py-32 md:py-40">
      {/* Video background */}
      <div className="absolute inset-0">
        <video autoPlay muted loop playsInline className="w-full h-full object-cover hidden md:block">
          <source src="/videos/cta-bg.mp4" type="video/mp4" />
        </video>
        <img src="/images/backgrounds/birthday-party.jpg" alt="" className="w-full h-full object-cover md:hidden" loading="lazy" />
        <div className="absolute inset-0 bg-black/60 md:bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-r from-gold/5 via-gold/10 to-gold/5" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center lg:px-8 animate-fade-up">
        <h2 className="font-heading text-3xl font-bold md:text-5xl text-white">
          {t("home.cta.title")}
        </h2>
        <p className="mt-6 text-lg md:text-xl text-[#D4D4E0]">
          {t("home.cta.desc")}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/planifica">
            <Button
              size="lg"
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2 px-8 text-base font-medium shadow-[0_4px_20px_rgba(201,168,76,0.3)]"
            >
              {t("hero.cta_primary")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="lg" variant="outline" className="border-white/40 bg-white/5 text-white hover:border-gold hover:bg-gold/10 hover:text-gold px-8 backdrop-blur-sm">
              {t("home.cta.secondary")}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
