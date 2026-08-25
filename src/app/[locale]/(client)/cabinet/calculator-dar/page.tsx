"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calculator, Gift, Heart, Sparkles } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

const EVENT_TYPES = [
  { value: "wedding", labelKey: "cabinet.giftCalc.events.wedding" },
  { value: "baptism", labelKey: "cabinet.giftCalc.events.baptism" },
  { value: "cumatrie", labelKey: "cabinet.giftCalc.events.cumatrie" },
  { value: "birthday", labelKey: "cabinet.giftCalc.events.birthday" },
];

const RELATIONS = [
  { value: "parents", labelKey: "cabinet.giftCalc.relations.parents", weight: 2.5 },
  { value: "siblings", labelKey: "cabinet.giftCalc.relations.siblings", weight: 2.0 },
  { value: "godparents", labelKey: "cabinet.giftCalc.relations.godparents", weight: 2.2 },
  { value: "relatives", labelKey: "cabinet.giftCalc.relations.relatives", weight: 1.5 },
  { value: "friends", labelKey: "cabinet.giftCalc.relations.friends", weight: 1.2 },
  { value: "colleagues", labelKey: "cabinet.giftCalc.relations.colleagues", weight: 1.0 },
  { value: "acquaintances", labelKey: "cabinet.giftCalc.relations.acquaintances", weight: 0.8 },
];

const PEOPLE_COUNTS = [
  { value: "1", labelKey: "cabinet.giftCalc.people.one", weight: 1.0 },
  { value: "2", labelKey: "cabinet.giftCalc.people.two", weight: 1.6 },
  { value: "3", labelKey: "cabinet.giftCalc.people.three", weight: 2.0 },
  { value: "4", labelKey: "cabinet.giftCalc.people.four", weight: 2.4 },
];

const INCOMES = [
  { value: "low", labelKey: "cabinet.giftCalc.incomes.low", weight: 0.7 },
  { value: "medium", labelKey: "cabinet.giftCalc.incomes.medium", weight: 1.0 },
  { value: "high", labelKey: "cabinet.giftCalc.incomes.high", weight: 1.3 },
  { value: "very_high", labelKey: "cabinet.giftCalc.incomes.veryHigh", weight: 1.6 },
];

const CITIES = [
  { value: "chisinau", labelKey: "cabinet.giftCalc.cities.chisinau", weight: 1.2 },
  { value: "balti", labelKey: "cabinet.giftCalc.cities.balti", weight: 1.0 },
  { value: "cahul", labelKey: "cabinet.giftCalc.cities.cahul", weight: 0.9 },
  { value: "rural", labelKey: "cabinet.giftCalc.cities.rural", weight: 0.8 },
];

const VENUE_TYPES = [
  { value: "luxury", labelKey: "cabinet.giftCalc.venues.luxury", weight: 1.3 },
  { value: "restaurant", labelKey: "cabinet.giftCalc.venues.restaurant", weight: 1.0 },
  { value: "banquet", labelKey: "cabinet.giftCalc.venues.banquet", weight: 0.9 },
  { value: "home", labelKey: "cabinet.giftCalc.venues.home", weight: 0.7 },
];

const DAYS = [
  { value: "saturday", labelKey: "cabinet.giftCalc.days.saturday", weight: 1.15 },
  { value: "sunday", labelKey: "cabinet.giftCalc.days.sunday", weight: 1.05 },
  { value: "friday", labelKey: "cabinet.giftCalc.days.friday", weight: 1.0 },
  { value: "weekday", labelKey: "cabinet.giftCalc.days.weekday", weight: 0.85 },
];

const SEASONS = [
  { value: "summer", labelKey: "cabinet.giftCalc.seasons.summer", weight: 1.15 },
  { value: "spring", labelKey: "cabinet.giftCalc.seasons.spring", weight: 1.05 },
  { value: "autumn", labelKey: "cabinet.giftCalc.seasons.autumn", weight: 1.0 },
  { value: "winter", labelKey: "cabinet.giftCalc.seasons.winter", weight: 0.85 },
];

// Base amounts per event type (EUR, per person)
const BASE_AMOUNTS: Record<string, number> = {
  wedding: 60,
  baptism: 40,
  cumatrie: 45,
  birthday: 35,
};

function findWeight(arr: { value: string; weight: number }[], val: string): number {
  return arr.find((a) => a.value === val)?.weight ?? 1;
}

export default function CalculatorDarPage() {
  const { t } = useLocale();
  const [eventType, setEventType] = useState("");
  const [relation, setRelation] = useState("");
  const [people, setPeople] = useState("");
  const [income, setIncome] = useState("");
  const [city, setCity] = useState("");
  const [venueType, setVenueType] = useState("");
  const [day, setDay] = useState("");
  const [season, setSeason] = useState("");
  const [result, setResult] = useState<{ min: number; recommended: number; generous: number } | null>(null);

  function calculate() {
    if (!eventType || !relation || !people || !income || !city || !venueType || !day || !season) return;

    const base = BASE_AMOUNTS[eventType] ?? 50;
    const multiplier =
      findWeight(RELATIONS, relation) *
      findWeight(PEOPLE_COUNTS, people) *
      findWeight(INCOMES, income) *
      findWeight(CITIES, city) *
      findWeight(VENUE_TYPES, venueType) *
      findWeight(DAYS, day) *
      findWeight(SEASONS, season);

    const recommended = Math.round(base * multiplier / 5) * 5;
    const min = Math.round(recommended * 0.7 / 5) * 5;
    const generous = Math.round(recommended * 1.35 / 5) * 5;

    setResult({ min, recommended, generous });
  }

  const allFilled = eventType && relation && people && income && city && venueType && day && season;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6 text-gold" />
          {t("cabinet.giftCalc.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("cabinet.giftCalc.subtitle")}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          <FormSelect label={t("cabinet.giftCalc.eventTypeLabel")} value={eventType} onChange={setEventType} options={EVENT_TYPES} placeholder={t("cabinet.giftCalc.eventTypePlaceholder")} />
          <FormSelect label={t("cabinet.giftCalc.relationLabel")} value={relation} onChange={setRelation} options={RELATIONS} placeholder={t("cabinet.giftCalc.relationPlaceholder")} />
          <FormSelect label={t("cabinet.giftCalc.peopleLabel")} value={people} onChange={setPeople} options={PEOPLE_COUNTS} placeholder={t("cabinet.giftCalc.peoplePlaceholder")} />
          <FormSelect label={t("cabinet.giftCalc.incomeLabel")} value={income} onChange={setIncome} options={INCOMES} placeholder={t("cabinet.giftCalc.incomePlaceholder")} />

          <div className="grid grid-cols-2 gap-4">
            <FormSelect label={t("cabinet.giftCalc.cityLabel")} value={city} onChange={setCity} options={CITIES} placeholder={t("cabinet.giftCalc.selectPlaceholder")} />
            <FormSelect label={t("cabinet.giftCalc.venueTypeLabel")} value={venueType} onChange={setVenueType} options={VENUE_TYPES} placeholder={t("cabinet.giftCalc.selectPlaceholder")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormSelect label={t("cabinet.giftCalc.dayLabel")} value={day} onChange={setDay} options={DAYS} placeholder={t("cabinet.giftCalc.selectPlaceholder")} />
            <FormSelect label={t("cabinet.giftCalc.seasonLabel")} value={season} onChange={setSeason} options={SEASONS} placeholder={t("cabinet.giftCalc.selectPlaceholder")} />
          </div>

          <Button
            onClick={calculate}
            disabled={!allFilled}
            className="w-full h-11 bg-gold text-[#0D0D0D] hover:bg-gold-dark text-sm font-semibold"
          >
            <Calculator className="mr-2 h-4 w-4" />
            {t("cabinet.giftCalc.submit")}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="mt-6 border-gold/30">
          <CardHeader>
            <CardTitle className="text-center text-lg font-heading flex items-center justify-center gap-2">
              <Sparkles className="h-5 w-5 text-gold" />
              {t("cabinet.giftCalc.resultTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-border/40 bg-accent/30 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("cabinet.giftCalc.minLabel")}</p>
                <p className="text-2xl font-heading font-bold text-warning">{result.min}€</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t("cabinet.giftCalc.minNote")}</p>
              </div>
              <div className="rounded-xl border-2 border-gold/40 bg-gold/5 p-4 text-center relative">
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gold px-2 py-0.5 text-[9px] font-bold text-[#0D0D0D]">
                  {t("cabinet.giftCalc.recommendedBadge")}
                </div>
                <p className="text-xs text-muted-foreground mb-1 mt-1">{t("cabinet.giftCalc.standardLabel")}</p>
                <p className="text-3xl font-heading font-bold text-gold">{result.recommended}€</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t("cabinet.giftCalc.standardNote")}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-accent/30 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t("cabinet.giftCalc.generousLabel")}</p>
                <p className="text-2xl font-heading font-bold text-success">{result.generous}€</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t("cabinet.giftCalc.generousNote")}</p>
              </div>
            </div>

            <div className="rounded-lg bg-accent/30 p-4 text-center">
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Heart className="h-4 w-4 text-gold" />
                {t("cabinet.giftCalc.disclaimer")}
              </p>
            </div>

            <div className="mt-6 rounded-lg border border-gold/20 bg-gold/5 p-4 text-center">
              <p className="text-sm font-medium">{t("cabinet.giftCalc.ctaTitle")}</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                {t("cabinet.giftCalc.ctaText")}
              </p>
              <a
                href="/planifica"
                className="inline-block rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-[#0D0D0D] hover:bg-gold-dark"
              >
                {t("cabinet.giftCalc.ctaButton")}
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; labelKey: string }[];
  placeholder: string;
}) {
  const { t } = useLocale();
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Select value={value} onValueChange={(v) => { if (v) onChange(v); }}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {t(o.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
