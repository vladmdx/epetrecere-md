"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="relative overflow-hidden py-32 md:py-40">
      {/* Video background */}
      <div className="absolute inset-0">
        <video autoPlay muted loop playsInline className="w-full h-full object-cover hidden md:block">
          <source src="/videos/cta-bg.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/60 md:bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-r from-gold/5 via-gold/10 to-gold/5" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center lg:px-8 animate-fade-up">
        <h2 className="font-heading text-3xl font-bold md:text-5xl text-white">
          Pregătit să-ți planifici evenimentul?
        </h2>
        <p className="mt-6 text-lg md:text-xl text-[#D4D4E0]">
          Trimite-ne o solicitare și te contactăm în cel mai scurt timp cu cele mai bune opțiuni.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/planifica">
            <Button
              size="lg"
              className="bg-gold text-background hover:bg-gold-dark gap-2 px-8 text-base font-medium shadow-[0_4px_20px_rgba(201,168,76,0.3)]"
            >
              Planifică Evenimentul
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/contact">
            <Button size="lg" variant="outline" className="border-gold text-gold hover:bg-gold/10 px-8">
              Contactează-ne
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
