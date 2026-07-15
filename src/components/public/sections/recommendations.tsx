"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Music, Sparkles, ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

// "Nu știi de unde să începi?" — a lightweight lead-in to the /planifica wizard.
// The reco counts are indicative (marketing) figures; the real matching happens
// once the user lands in the planner.
const EVENT_TYPES = [
  { value: "wedding", label: "Nuntă" },
  { value: "baptism", label: "Botez" },
  { value: "cumatrie", label: "Cumătrie" },
  { value: "birthday", label: "Zi de naștere" },
  { value: "corporate", label: "Eveniment corporate" },
  { value: "other", label: "Altă petrecere" },
];

const BUDGETS = [
  { value: "0-30000", label: "sub 30.000 MDL" },
  { value: "30000-50000", label: "30.000 - 50.000 MDL" },
  { value: "50000-100000", label: "50.000 - 100.000 MDL" },
  { value: "100000+", label: "peste 100.000 MDL" },
];

const RECOS = [
  { icon: MapPin, label: "Locații potrivite", value: 12 },
  { icon: Music, label: "Artiști potriviți", value: 18 },
  { icon: Sparkles, label: "Servicii potrivite", value: 24 },
];

export function RecommendationsSection() {
  const router = useRouter();
  const [eventType, setEventType] = useState("wedding");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState("120");
  const [budget, setBudget] = useState("30000-50000");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (eventType) params.set("eventType", eventType);
    if (date) params.set("date", date);
    if (guests) params.set("guests", guests);
    if (budget) params.set("budget", budget);
    router.push(`/planifica?${params.toString()}`);
  }

  return (
    <section className="bg-[#F0EBE0] py-20 text-[#2C2C3A]">
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[3px] text-gold-dark">
              Recomandări inteligente
            </p>
            <h2 className="font-heading text-3xl font-bold md:text-[40px]">
              Nu știi de unde să începi?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[#6B6B7B]">
              Spune-ne câteva detalii despre evenimentul tău, iar noi îți
              recomandăm cele mai bune locații, artiști și servicii potrivite
              pentru tine.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
          {/* Form card */}
          <ScrollReveal direction="right">
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-[#E4DECF] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
            >
              <h3 className="mb-5 font-heading text-lg font-bold">
                Preferințele evenimentului tău
              </h3>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6B6B7B]">
                    Tip eveniment
                  </span>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[#D4CFC4] bg-[#FAF8F2] px-3 text-sm outline-none focus:border-gold"
                  >
                    {EVENT_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6B6B7B]">
                      Data
                    </span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-[#D4CFC4] bg-[#FAF8F2] px-3 text-sm outline-none focus:border-gold"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6B6B7B]">
                      Invitați
                    </span>
                    <input
                      inputMode="numeric"
                      value={guests}
                      onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 5))}
                      className="h-11 w-full rounded-xl border border-[#D4CFC4] bg-[#FAF8F2] px-3 text-sm outline-none focus:border-gold"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6B6B7B]">
                    Buget
                  </span>
                  <select
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[#D4CFC4] bg-[#FAF8F2] px-3 text-sm outline-none focus:border-gold"
                  >
                    {BUDGETS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="submit"
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gold text-sm font-semibold text-[#0D0D0D] transition-colors hover:bg-gold-dark"
              >
                Planifică evenimentul
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </ScrollReveal>

          {/* Connector arrow */}
          <div className="hidden items-center justify-center lg:flex">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-white text-gold shadow-sm">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>

          {/* Recommendations panel */}
          <ScrollReveal direction="left" delay={0.15}>
            <div className="rounded-2xl border border-gold/20 bg-[#1A1A2E] p-6 text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
              <h3 className="mb-5 font-heading text-lg font-bold">
                Recomandări pentru tine
              </h3>
              <div className="space-y-3">
                {RECOS.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15">
                      <r.icon className="h-5 w-5 text-gold" />
                    </div>
                    <span className="flex-1 text-sm text-white/80">{r.label}</span>
                    <span className="font-heading text-2xl font-bold text-gold">
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
