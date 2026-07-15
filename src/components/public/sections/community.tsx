"use client";

import { useState, useEffect } from "react";
import { Star, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

const STATS = [
  { value: "500+", label: "Furnizori verificați" },
  { value: "200+", label: "Locații premium" },
  { value: "12+", label: "Categorii de servicii" },
  { value: "1.000+", label: "Solicitări finalizate" },
];

interface Testimonial {
  id: number;
  authorName: string;
  eventType: string | null;
  location?: string | null;
  text: string;
  rating: number;
}

// Fallback testimonials so the section always renders (the /api/reviews/featured
// endpoint overrides these when it returns approved reviews).
const FALLBACK_TESTIMONIALS: Testimonial[] = [
  {
    id: 1,
    authorName: "Ana & Andrei",
    eventType: "Nuntă",
    location: "Chișinău",
    text: "Datorită ePetrecere.md am găsit locația perfectă și echipa de care aveam nevoie. Totul a fost organizat impecabil!",
    rating: 5,
  },
  {
    id: 2,
    authorName: "Cristina M.",
    eventType: "Botez",
    location: "Bălți",
    text: "Am comparat zeci de furnizori într-un singur loc și am rezervat totul în câteva zile. Recomand cu încredere!",
    rating: 5,
  },
  {
    id: 3,
    authorName: "Sergiu & Diana",
    eventType: "Cumătrie",
    location: "Orhei",
    text: "Platforma ne-a economisit timp enorm. Am găsit muzicieni și decor de calitate, exact în bugetul nostru.",
    rating: 5,
  },
];

export function CommunitySection() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>(FALLBACK_TESTIMONIALS);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/reviews/featured");
        if (res.ok) {
          const data = await res.json();
          if (alive && Array.isArray(data) && data.length > 0) setTestimonials(data);
        }
      } catch {
        // keep fallback
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (testimonials.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [testimonials.length]);

  const t = testimonials[current % testimonials.length];
  const sub = [t.eventType, t.location].filter(Boolean).join(", ");

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <h2 className="mb-12 text-center font-heading text-3xl font-bold text-[#FAF8F2] md:text-[40px]">
            O comunitate de încredere
          </h2>
        </ScrollReveal>

        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          {/* Stats */}
          <ScrollReveal>
            <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:gap-y-0">
              {STATS.map((s) => (
                <div key={s.label} className="text-center lg:text-left">
                  <p className="font-heading text-4xl font-bold text-gold md:text-[44px]">
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-sm text-[#B0B0C0]">{s.label}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>

          {/* Testimonial */}
          <ScrollReveal direction="left" delay={0.15}>
            <div className="rounded-2xl border border-gold/15 bg-[#1A1A2E] p-7 md:p-8">
              <Quote className="mb-4 h-8 w-8 text-gold/40" />
              <p className="text-lg leading-relaxed text-[#E8E6DF]">
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="mt-5 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn("h-4 w-4", i < t.rating ? "fill-gold text-gold" : "text-white/20")}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-white">{t.authorName}</p>
                  {sub && <p className="text-sm text-gold">{sub}</p>}
                </div>
                <div className="flex gap-2">
                  {testimonials.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrent(i)}
                      aria-label={`Testimonial ${i + 1}`}
                      aria-current={i === current ? "true" : undefined}
                      className={cn(
                        "h-2 rounded-full transition-all",
                        i === current ? "w-6 bg-gold" : "w-2 bg-white/25",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
