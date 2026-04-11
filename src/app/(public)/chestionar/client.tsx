"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Check,
  Loader2,
  Star,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface QuizAnswers {
  eventType: string;
  guestCount: number;
  budget: number;
  city: string;
  style: string;
  services: string[];
}

interface MatchResult {
  id: number;
  slug: string;
  name: string;
  location: string | null;
  priceFrom: number | null;
  ratingAvg: number | null;
  matchScore: number;
  reasons: string[];
  coverImage: string | null;
  categories: string[];
}

const EVENT_TYPES = [
  { value: "wedding", label: "Nuntă", emoji: "💍" },
  { value: "birthday", label: "Zi de naștere", emoji: "🎂" },
  { value: "corporate", label: "Corporate", emoji: "💼" },
  { value: "baptism", label: "Cumătrie", emoji: "👶" },
  { value: "anniversary", label: "Aniversare", emoji: "🎉" },
  { value: "graduation", label: "Absolvire", emoji: "🎓" },
];

const STYLES = [
  { value: "elegant", label: "Elegant & clasic", desc: "Rafinament și simplitate" },
  { value: "modern", label: "Modern & trendy", desc: "Minimalism actual" },
  { value: "rustic", label: "Rustic & tradițional", desc: "Autentic moldovenesc" },
  { value: "glamour", label: "Glamour & luxos", desc: "Spectaculos și opulent" },
  { value: "boho", label: "Boho & natural", desc: "Relaxat și organic" },
  { value: "themed", label: "Tematic", desc: "Concept personalizat" },
];

const SERVICES = [
  { value: "singer", label: "Cântăreț / Interpret" },
  { value: "band", label: "Formație muzicală" },
  { value: "dj", label: "DJ" },
  { value: "mc", label: "Moderator" },
  { value: "photographer", label: "Foto-Video" },
  { value: "show", label: "Show-program / Dansatori" },
  { value: "decor", label: "Decor & Floristică" },
  { value: "animators", label: "Animatori copii" },
];

const CITIES = [
  "Chișinău",
  "Bălți",
  "Cahul",
  "Ungheni",
  "Orhei",
  "Soroca",
  "Comrat",
  "Tiraspol",
];

const STEPS = [
  "Tipul evenimentului",
  "Numărul invitaților",
  "Bugetul aproximativ",
  "Locația",
  "Stilul dorit",
  "Ce servicii cauți",
];

export function MatchingQuizClient() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({
    eventType: "",
    guestCount: 0,
    budget: 0,
    city: "",
    style: "",
    services: [],
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchResult[] | null>(null);

  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return !!answers.eventType;
      case 1:
        return answers.guestCount > 0;
      case 2:
        return answers.budget > 0;
      case 3:
        return !!answers.city;
      case 4:
        return !!answers.style;
      case 5:
        return answers.services.length > 0;
      default:
        return false;
    }
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/quiz-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      if (!res.ok) throw new Error("Eroare potrivire");
      const data = (await res.json()) as { matches: MatchResult[] };
      setResults(data.matches);
    } catch (err) {
      console.error(err);
      alert("A apărut o eroare. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      void handleSubmit();
    }
  }

  function prev() {
    if (step > 0) setStep(step - 1);
  }

  function toggleService(s: string) {
    setAnswers((a) => ({
      ...a,
      services: a.services.includes(s)
        ? a.services.filter((x) => x !== s)
        : [...a.services, s],
    }));
  }

  // Results screen
  if (results) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <div className="text-center">
          <Sparkles className="mx-auto h-10 w-10 text-gold" />
          <h1 className="mt-3 font-heading text-2xl font-bold md:text-3xl">
            {results.length > 0
              ? `Am găsit ${results.length} furnizori potriviți pentru tine`
              : "Niciun furnizor găsit"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {results.length > 0
              ? "Sortați după scorul de potrivire cu răspunsurile tale."
              : "Încearcă să ajustezi criteriile (buget, oraș sau servicii)."}
          </p>
        </div>

        {results.length > 0 ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {results.map((m) => (
              <Link
                key={m.id}
                href={`/artisti/${m.slug}`}
                className="group flex gap-4 rounded-xl border border-border/40 bg-card p-4 transition-all hover:border-gold/40"
              >
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {m.coverImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.coverImage}
                      alt={m.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-heading font-bold group-hover:text-gold">
                      {m.name}
                    </h3>
                    <Badge className="bg-gold/15 text-gold">
                      {m.matchScore}% match
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {m.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {m.location}
                      </span>
                    )}
                    {m.ratingAvg ? (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-gold text-gold" />{" "}
                        {m.ratingAvg.toFixed(1)}
                      </span>
                    ) : null}
                    {m.priceFrom && (
                      <span className="text-foreground">
                        de la {m.priceFrom}€
                      </span>
                    )}
                  </div>
                  {m.reasons.length > 0 && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {m.reasons.slice(0, 3).join(" · ")}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-10 flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setResults(null);
              setStep(0);
              setAnswers({
                eventType: "",
                guestCount: 0,
                budget: 0,
                city: "",
                style: "",
                services: [],
              });
            }}
          >
            Începe din nou
          </Button>
          <Link
            href="/artisti"
            className="inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
          >
            Vezi toți artiștii
          </Link>
        </div>
      </div>
    );
  }

  // Quiz screen
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 lg:px-8">
      <div className="text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
          Chestionar rapid
        </p>
        <h1 className="font-heading text-2xl font-bold md:text-3xl">
          Găsim împreună furnizorii perfecți
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pas {step + 1} din {STEPS.length} · {STEPS[step]}
        </p>
      </div>

      <Progress
        value={((step + 1) / STEPS.length) * 100}
        className="mt-6 h-1.5"
      />

      <div className="mt-10 min-h-[300px]">
        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {EVENT_TYPES.map((e) => (
              <button
                key={e.value}
                type="button"
                onClick={() =>
                  setAnswers({ ...answers, eventType: e.value })
                }
                className={`rounded-xl border p-5 text-left transition-all ${
                  answers.eventType === e.value
                    ? "border-gold bg-gold/10"
                    : "border-border/40 bg-card hover:border-gold/30"
                }`}
              >
                <div className="text-2xl">{e.emoji}</div>
                <div className="mt-2 font-medium">{e.label}</div>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {[
              { v: 30, l: "Sub 50 invitați", d: "Intim" },
              { v: 100, l: "50–150 invitați", d: "Mediu" },
              { v: 200, l: "150–300 invitați", d: "Mare" },
              { v: 400, l: "Peste 300 invitați", d: "Foarte mare" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() =>
                  setAnswers({ ...answers, guestCount: o.v })
                }
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                  answers.guestCount === o.v
                    ? "border-gold bg-gold/10"
                    : "border-border/40 bg-card hover:border-gold/30"
                }`}
              >
                <div>
                  <div className="font-medium">{o.l}</div>
                  <div className="text-xs text-muted-foreground">{o.d}</div>
                </div>
                {answers.guestCount === o.v && (
                  <Check className="h-5 w-5 text-gold" />
                )}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {[
              { v: 1000, l: "Sub 1.500€" },
              { v: 3000, l: "1.500€ – 5.000€" },
              { v: 8000, l: "5.000€ – 12.000€" },
              { v: 15000, l: "12.000€ – 25.000€" },
              { v: 35000, l: "Peste 25.000€" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setAnswers({ ...answers, budget: o.v })}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                  answers.budget === o.v
                    ? "border-gold bg-gold/10"
                    : "border-border/40 bg-card hover:border-gold/30"
                }`}
              >
                <div className="font-medium">{o.l}</div>
                {answers.budget === o.v && (
                  <Check className="h-5 w-5 text-gold" />
                )}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CITIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAnswers({ ...answers, city: c })}
                className={`rounded-xl border p-4 text-center transition-all ${
                  answers.city === c
                    ? "border-gold bg-gold/10"
                    : "border-border/40 bg-card hover:border-gold/30"
                }`}
              >
                <MapPin className="mx-auto h-4 w-4 text-muted-foreground" />
                <div className="mt-1 text-sm font-medium">{c}</div>
              </button>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setAnswers({ ...answers, style: s.value })}
                className={`rounded-xl border p-4 text-left transition-all ${
                  answers.style === s.value
                    ? "border-gold bg-gold/10"
                    : "border-border/40 bg-card hover:border-gold/30"
                }`}
              >
                <div className="font-medium">{s.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {s.desc}
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {SERVICES.map((s) => {
              const active = answers.services.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleService(s.value)}
                  className={`flex items-center justify-between rounded-xl border p-4 text-left transition-all ${
                    active
                      ? "border-gold bg-gold/10"
                      : "border-border/40 bg-card hover:border-gold/30"
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                  {active && <Check className="h-5 w-5 text-gold" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-between gap-3">
        <Button
          variant="outline"
          onClick={prev}
          disabled={step === 0 || loading}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Înapoi
        </Button>
        <Button
          onClick={next}
          disabled={!canAdvance() || loading}
          className="gap-2 bg-gold text-background hover:bg-gold-dark"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : step === STEPS.length - 1 ? (
            <>
              <Sparkles className="h-4 w-4" /> Găsește furnizori
            </>
          ) : (
            <>
              Continuă <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
