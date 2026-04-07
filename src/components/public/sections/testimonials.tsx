"use client";

import { useState, useEffect } from "react";
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const testimonials = [
  { id: 1, author: "Maria & Andrei", type: "Nuntă", text: "O experiență incredibilă! Echipa ePetrecere ne-a ajutat să găsim artiștii perfecți pentru nunta noastră. Totul a fost impecabil.", rating: 5 },
  { id: 2, author: "Elena Moraru", type: "Corporate", text: "Profesionalism la cel mai înalt nivel. Am organizat un eveniment corporate pentru 200 de persoane și totul a decurs perfect.", rating: 5 },
  { id: 3, author: "Ion & Ana", type: "Botez", text: "Mulțumim pentru ajutor în organizarea botezului! Artiștii recomandați au fost excelenți, iar oaspeții au fost încântați.", rating: 5 },
  { id: 4, author: "SC ProBusiness", type: "Corporate", text: "Colaborăm cu ePetrecere de 3 ani pentru toate evenimentele noastre corporate. Mereu livrează calitate.", rating: 4 },
  { id: 5, author: "Natalia & Victor", type: "Nuntă", text: "Platforma ne-a economisit enorm de mult timp. Am găsit totul într-un singur loc — de la moderator la fotograf.", rating: 5 },
];

export function TestimonialsSection() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((c) => (c + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const t = testimonials[current];

  return (
    <section className="py-20">
      <div className="mx-auto max-w-4xl px-4 lg:px-8">
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
            <p className="mt-3 font-heading font-bold">{t.author}</p>
            <p className="text-sm text-gold">{t.type}</p>
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
