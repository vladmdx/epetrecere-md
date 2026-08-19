"use client";

import { Fragment } from "react";
import Link from "@/components/shared/locale-link";
import { Search, SlidersHorizontal, CalendarCheck, ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { useLocale } from "@/hooks/use-locale";

const STEPS = [
  { num: "01", icon: Search, key: "s1" },
  { num: "02", icon: SlidersHorizontal, key: "s2" },
  { num: "03", icon: CalendarCheck, key: "s3" },
] as const;

export function ProcessSection() {
  const { t } = useLocale();

  return (
    <section
      id="cum-functioneaza"
      className="relative scroll-mt-20 overflow-hidden border-y border-[#dfd5c1] bg-[#F0EBE0] py-20 text-[#252534]"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-36 h-96 w-96 rounded-full bg-gold/12 blur-3xl" />
        <div className="absolute -bottom-44 -right-24 h-[28rem] w-[28rem] rounded-full bg-[#1A1A2E]/8 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[3px] text-gold">
              {t("home.process.eyebrow")}
            </p>
            <h2 className="font-heading text-3xl font-bold text-[#252534] md:text-[40px]">
              {t("home.process.title")}
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid items-start gap-8 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STEPS.map((step, i) => (
            <Fragment key={step.num}>
              <ScrollReveal delay={i * 0.12}>
                <div className="text-center">
                  <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-gold/35 bg-[#1A1A2E] text-gold shadow-[0_14px_34px_rgba(26,26,46,0.15)]">
                    <step.icon className="h-7 w-7" />
                    <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-[#0D0D0D]">
                      {step.num}
                    </span>
                  </div>
                  <h3 className="mb-2 font-heading text-lg font-bold text-[#252534]">
                    {t(`home.process.${step.key}t`)}
                  </h3>
                  <p className="mx-auto max-w-[240px] text-sm leading-relaxed text-[#5D5D6D]">
                    {t(`home.process.${step.key}d`)}
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

        <ScrollReveal delay={0.35}>
          <div className="mt-12 text-center">
            <Link
              href="/planifica"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f0ce72,#d8a63c)] px-7 text-sm font-semibold text-[#101019] shadow-[0_12px_28px_rgba(170,126,36,.24)] transition hover:-translate-y-0.5 hover:brightness-105"
            >
              Planifică evenimentul
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
