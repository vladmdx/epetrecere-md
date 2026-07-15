"use client";

import { Fragment } from "react";
import { Search, SlidersHorizontal, CalendarCheck, ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

const STEPS = [
  {
    num: "01",
    icon: Search,
    title: "Spune-ne ce cauți",
    desc: "Completează detaliile evenimentului tău: tip, dată, număr de invitați și buget.",
  },
  {
    num: "02",
    icon: SlidersHorizontal,
    title: "Compară opțiunile",
    desc: "Primești recomandări personalizate. Compară și alege ce ți se potrivește.",
  },
  {
    num: "03",
    icon: CalendarCheck,
    title: "Rezervă și organizează",
    desc: "Rezervă furnizorii preferați și coordonează totul direct prin platformă.",
  },
];

export function ProcessSection() {
  return (
    <section id="cum-functioneaza" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[3px] text-gold">
              Cum funcționează
            </p>
            <h2 className="font-heading text-3xl font-bold text-[#FAF8F2] md:text-[40px]">
              Trei pași până la evenimentul perfect
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid items-start gap-8 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STEPS.map((step, i) => (
            <Fragment key={step.num}>
              <ScrollReveal delay={i * 0.12}>
                <div className="text-center">
                  <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-[#1A1A2E] text-gold shadow-[0_0_25px_rgba(201,168,76,0.12)]">
                    <step.icon className="h-7 w-7" />
                    <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-[#0D0D0D]">
                      {step.num}
                    </span>
                  </div>
                  <h3 className="mb-2 font-heading text-lg font-bold text-[#FAF8F2]">
                    {step.title}
                  </h3>
                  <p className="mx-auto max-w-[240px] text-sm leading-relaxed text-[#B0B0C0]">
                    {step.desc}
                  </p>
                </div>
              </ScrollReveal>
              {i < STEPS.length - 1 && (
                <div className="hidden items-center justify-center pt-5 text-gold/40 md:flex">
                  <ArrowRight className="h-6 w-6" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
