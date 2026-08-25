"use client";

import { useState } from "react";
import Link from "@/components/shared/locale-link";
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
import { formatPrice } from "@/lib/format/price";
import { useLocale } from "@/hooks/use-locale";
import { ALL_EVENT_TYPES, EVENT_TYPE_EMOJI, eventTypeLabel } from "@/lib/events/normalize";

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

// Derived from the canonical list. The hand-written version had two real
// faults: it offered the label "Cumătrie" under the value `baptism`, and it
// emitted `anniversary` and `graduation`, which no other part of the product
// recognises as event types.
// Built inside the component so the labels follow the reader's language —
// eventTypeLabel defaults to Romanian when no locale is passed.
function eventTypes(locale: string) {
  return ALL_EVENT_TYPES.map((k) => ({
    value: k,
    label: eventTypeLabel(k, locale),
    emoji: EVENT_TYPE_EMOJI[k],
  }));
}

const STYLES = [
  { value: "elegant", label: "quiz.styles.elegant", desc: "quiz.styles.elegantDesc" },
  { value: "modern", label: "quiz.styles.modern", desc: "quiz.styles.modernDesc" },
  { value: "rustic", label: "quiz.styles.rustic", desc: "quiz.styles.rusticDesc" },
  { value: "glamour", label: "quiz.styles.glamour", desc: "quiz.styles.glamourDesc" },
  { value: "boho", label: "quiz.styles.boho", desc: "quiz.styles.bohoDesc" },
  { value: "themed", label: "quiz.styles.themed", desc: "quiz.styles.themedDesc" },
];

const SERVICES = [
  { value: "singer", label: "quiz.services.singer" },
  { value: "band", label: "quiz.services.band" },
  { value: "dj", label: "quiz.services.dj" },
  { value: "mc", label: "quiz.services.mc" },
  { value: "photographer", label: "quiz.services.photographer" },
  { value: "show", label: "quiz.services.show" },
  { value: "decor", label: "quiz.services.decor" },
  { value: "animators", label: "quiz.services.animators" },
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
  "quiz.steps.eventType",
  "quiz.steps.guestCount",
  "quiz.steps.budget",
  "quiz.steps.location",
  "quiz.steps.style",
  "quiz.steps.services",
];

export function MatchingQuizClient() {
  const { t, locale } = useLocale();
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
      alert(t("quiz.submitError"));
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
              ? t("quiz.resultsTitle", { count: results.length })
              : t("quiz.emptyTitle")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {results.length > 0
              ? t("quiz.resultsHint")
              : t("quiz.emptyHint")}
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
                        {t("home.common.from", { price: formatPrice(m.priceFrom) ?? "" })}
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
            {t("quiz.startOver")}
          </Button>
          <Link
            href="/artisti"
            className="inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
          >
            {t("quiz.seeAllArtists")}
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
          {t("quiz.eyebrow")}
        </p>
        <h1 className="font-heading text-2xl font-bold md:text-3xl">
          {t("quiz.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("quiz.stepOf", { current: step + 1, total: STEPS.length })} ·{" "}
          {t(STEPS[step])}
        </p>
      </div>

      <Progress
        value={((step + 1) / STEPS.length) * 100}
        className="mt-6 h-1.5"
      />

      <div className="mt-10 min-h-[300px]">
        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {eventTypes(locale).map((e) => (
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
              { v: 30, l: "quiz.guests.under50", d: "quiz.guests.under50Desc" },
              { v: 100, l: "quiz.guests.to150", d: "quiz.guests.to150Desc" },
              { v: 200, l: "quiz.guests.to300", d: "quiz.guests.to300Desc" },
              { v: 400, l: "quiz.guests.over300", d: "quiz.guests.over300Desc" },
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
                  <div className="font-medium">{t(o.l)}</div>
                  <div className="text-xs text-muted-foreground">{t(o.d)}</div>
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
              { v: 1000, l: "quiz.budget.under1500" },
              { v: 3000, l: "quiz.budget.to5000" },
              { v: 8000, l: "quiz.budget.to12000" },
              { v: 15000, l: "quiz.budget.to25000" },
              { v: 35000, l: "quiz.budget.over25000" },
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
                <div className="font-medium">{t(o.l)}</div>
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
                <div className="font-medium">{t(s.label)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t(s.desc)}
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
                  <span className="font-medium">{t(s.label)}</span>
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
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </Button>
        <Button
          onClick={next}
          disabled={!canAdvance() || loading}
          className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : step === STEPS.length - 1 ? (
            <>
              <Sparkles className="h-4 w-4" /> {t("quiz.findVendors")}
            </>
          ) : (
            <>
              {t("common.next")} <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
