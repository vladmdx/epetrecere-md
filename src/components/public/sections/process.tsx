"use client";

import { Phone, MessageSquare, Search, FileCheck, PartyPopper } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";
import { GoldDivider } from "@/components/shared/gold-divider";

const steps = [
  { icon: Phone, key: "step1" },
  { icon: MessageSquare, key: "step2" },
  { icon: Search, key: "step3" },
  { icon: FileCheck, key: "step4" },
  { icon: PartyPopper, key: "step5" },
];

export function ProcessSection() {
  const { t } = useLocale();

  return (
    <section className="bg-card py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-16 text-center">
          <GoldDivider />
          <h2 className="mt-4 font-heading text-3xl font-bold md:text-4xl">
            {t("process.title")}
          </h2>
        </div>

        <div className="relative flex flex-col items-center gap-12 md:flex-row md:justify-between md:gap-0">
          {/* Animated connecting line */}
          <div className="absolute left-1/2 top-0 hidden h-full w-px bg-gold/10 md:left-[10%] md:right-[10%] md:top-[calc(50%-20px)] md:h-[2px] md:w-[80%] md:bg-gold/10 md:block">
            <div className="absolute inset-0 process-line-animated h-full rounded-full" />
          </div>

          {steps.map((step, i) => (
            <div
              key={step.key}
              className="relative z-10 flex flex-col items-center text-center md:flex-1 animate-fade-up"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold bg-background text-gold shadow-[0_0_20px_rgba(201,168,76,0.15)]">
                <step.icon className="h-7 w-7" />
              </div>
              <h3 className="mb-1 font-heading text-sm font-bold">
                {t(`process.${step.key}_title`)}
              </h3>
              <p className="max-w-[160px] text-xs text-muted-foreground">
                {t(`process.${step.key}_desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
