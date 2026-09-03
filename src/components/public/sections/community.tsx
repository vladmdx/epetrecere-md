"use client";

import { useState, useEffect } from "react";
import { Star, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { useLocale } from "@/hooks/use-locale";

export interface CommunityStats {
  activeArtists: number;
  activeVenues: number;
  serviceCategories: number;
  completedRequests: number;
}

/** "500+" style rounding, but only once a number is big enough to round. */
function display(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 1000)}.000+`;
  if (n >= 100) return `${Math.floor(n / 100) * 100}+`;
  if (n >= 10) return `${Math.floor(n / 10) * 10}+`;
  return String(n);
}

interface Testimonial {
  id: number;
  authorName: string;
  eventType: string | null;
  location?: string | null;
  text: string;
  rating: number;
}

export function CommunitySection({ stats }: { stats?: CommunityStats }) {
  const { t } = useLocale();

  // Real catalog numbers. The previous "500+ / 200+ / 12+ / 1.000+" were
  // placeholders unrelated to the database — flagged by the QA audit.
  const STATS = stats
    ? [
        { value: display(stats.activeArtists), key: "statVendors" },
        { value: display(stats.activeVenues), key: "statVenues" },
        { value: display(stats.serviceCategories), key: "statCategories" },
        { value: display(stats.completedRequests), key: "statRequests" },
      ]
    : [];

  // Only approved reviews, never fabricated fallback testimonials.
  const [fromApi, setFromApi] = useState<Testimonial[] | null>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/reviews/featured");
        if (res.ok) {
          const data = await res.json();
          if (alive && Array.isArray(data) && data.length > 0) setFromApi(data);
        }
      } catch {
        // keep fallback
      }
    })();
    return () => { alive = false; };
  }, []);

  const testimonials = fromApi ?? [];

  useEffect(() => {
    if (testimonials.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [testimonials.length]);

  if (!testimonials.length) return null;
  const item = testimonials[current % testimonials.length];
  const sub = [item.eventType, item.location].filter(Boolean).join(", ");

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <h2 className="mb-12 text-center font-heading text-3xl font-bold text-[#FAF8F2] md:text-[40px]">
            {t("home.community.title")}
          </h2>
        </ScrollReveal>

        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          {/* Stats */}
          <ScrollReveal>
            <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:gap-y-0">
              {STATS.map((s) => (
                <div key={s.key} className="text-center lg:text-left">
                  <p className="font-heading text-4xl font-bold text-gold md:text-[44px]">
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-sm text-[#B0B0C0]">{t(`home.community.${s.key}`)}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>

          {/* Testimonial */}
          <ScrollReveal direction="left" delay={0.15}>
            <div className="rounded-2xl border border-gold/15 bg-[#1A1A2E] p-7 md:p-8">
              <Quote className="mb-4 h-8 w-8 text-gold/40" />
              <p className="text-lg leading-relaxed text-[#E8E6DF]">
                &ldquo;{item.text}&rdquo;
              </p>
              <div className="mt-5 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn("h-4 w-4", i < item.rating ? "fill-gold text-gold" : "text-white/20")}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-white">{item.authorName}</p>
                  {sub && <p className="text-sm text-gold">{sub}</p>}
                </div>
                <div className="flex gap-2">
                  {testimonials.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrent(i)}
                      aria-label={`${i + 1}`}
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
