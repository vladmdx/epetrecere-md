"use client";

import { useState, useEffect } from "react";
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Testimonial {
  id: number;
  authorName: string;
  eventType: string | null;
  text: string;
  rating: number;
}

export function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [current, setCurrent] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Fetch real approved reviews (high-rated)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/reviews/featured");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setTestimonials(data);
          }
        }
      } catch {
        // Section won't render if no data
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (testimonials.length === 0) return;
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [testimonials.length]);

  // Don't render until loaded; hide if no testimonials
  if (!loaded || testimonials.length === 0) return null;

  const t = testimonials[current];

  return (
    <section className="py-20 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <video autoPlay muted loop playsInline className="w-full h-full object-cover opacity-[0.12] blur-[2px] hidden md:block parallax-bg">
          <source src="/videos/testimonials-bg.mp4" type="video/mp4" />
        </video>
        <img src="/images/backgrounds/club-blue.jpg" alt="" className="w-full h-full object-cover opacity-[0.10] blur-[2px] md:hidden" loading="lazy" />
      </div>
      <div className="relative z-10 mx-auto max-w-4xl px-4 lg:px-8">
        <div className="mb-12 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">Testimoniale</p>
          <h2 className="font-heading text-3xl font-bold md:text-4xl">Ce spun clienții noștri</h2>
        </div>

        <div className="relative">
          <div className="rounded-2xl border border-border/40 bg-card p-8 text-center md:p-12">
            <Quote className="mx-auto mb-6 h-10 w-10 text-gold/30" />
            <p className="text-lg text-muted-foreground md:text-xl leading-relaxed">
              &ldquo;{t.text}&rdquo;
            </p>
            <div className="mt-6 flex justify-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn("h-4 w-4", i < t.rating ? "fill-gold text-gold" : "text-muted")} />
              ))}
            </div>
            <p className="mt-3 font-heading font-bold">{t.authorName}</p>
            <p className="text-sm text-gold">{t.eventType || "Eveniment"}</p>
          </div>

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setCurrent((c) => (c - 1 + testimonials.length) % testimonials.length)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={cn("h-2 w-2 rounded-full transition-all", i === current ? "w-6 bg-gold" : "bg-muted-foreground/30")}
                />
              ))}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCurrent((c) => (c + 1) % testimonials.length)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
