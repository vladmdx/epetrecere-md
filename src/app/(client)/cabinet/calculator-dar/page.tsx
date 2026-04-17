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

const EVENT_TYPES = [
  { value: "wedding", label: "Nuntă" },
  { value: "baptism", label: "Botez" },
  { value: "cumatrie", label: "Cumătrie" },
  { value: "birthday", label: "Aniversare" },
];

const RELATIONS = [
  { value: "parents", label: "Părinți", weight: 2.5 },
  { value: "siblings", label: "Frați / Surori", weight: 2.0 },
  { value: "godparents", label: "Nași", weight: 2.2 },
  { value: "relatives", label: "Rude apropiate", weight: 1.5 },
  { value: "friends", label: "Prieteni", weight: 1.2 },
  { value: "colleagues", label: "Colegi de serviciu", weight: 1.0 },
  { value: "acquaintances", label: "Cunoștințe", weight: 0.8 },
];

const PEOPLE_COUNTS = [
  { value: "1", label: "1 persoană", weight: 1.0 },
  { value: "2", label: "2 persoane (cuplu)", weight: 1.6 },
  { value: "3", label: "3 persoane (familie)", weight: 2.0 },
  { value: "4", label: "4+ persoane", weight: 2.4 },
];

const INCOMES = [
  { value: "low", label: "Sub 5.000 MDL", weight: 0.7 },
  { value: "medium", label: "5.000 – 10.000 MDL", weight: 1.0 },
  { value: "high", label: "10.000 – 20.000 MDL", weight: 1.3 },
  { value: "very_high", label: "Peste 20.000 MDL", weight: 1.6 },
];

const CITIES = [
  { value: "chisinau", label: "Chișinău", weight: 1.2 },
  { value: "balti", label: "Bălți", weight: 1.0 },
  { value: "cahul", label: "Cahul", weight: 0.9 },
  { value: "rural", label: "Zone rurale", weight: 0.8 },
];

const VENUE_TYPES = [
  { value: "luxury", label: "Hotel de lux", weight: 1.3 },
  { value: "restaurant", label: "Restaurant standard", weight: 1.0 },
  { value: "banquet", label: "Sală de banchet", weight: 0.9 },
  { value: "home", label: "Acasă / curte", weight: 0.7 },
];

const DAYS = [
  { value: "saturday", label: "Sâmbătă", weight: 1.15 },
  { value: "sunday", label: "Duminică", weight: 1.05 },
  { value: "friday", label: "Vineri", weight: 1.0 },
  { value: "weekday", label: "Zi lucrătoare", weight: 0.85 },
];

const SEASONS = [
  { value: "summer", label: "Vară (Iun-Aug)", weight: 1.15 },
  { value: "spring", label: "Primăvară (Mar-Mai)", weight: 1.05 },
  { value: "autumn", label: "Toamnă (Sep-Nov)", weight: 1.0 },
  { value: "winter", label: "Iarnă (Dec-Feb)", weight: 0.85 },
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
          Calculator Dar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Calculează suma orientativă pe care să o dai cadou la nuntă, botez sau alt eveniment.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          <FormSelect label="Tip eveniment" value={eventType} onChange={setEventType} options={EVENT_TYPES} placeholder="Selectează evenimentul" />
          <FormSelect label="Relația cu mirii / sărbătoriții" value={relation} onChange={setRelation} options={RELATIONS} placeholder="Selectează relația" />
          <FormSelect label="Număr persoane" value={people} onChange={setPeople} options={PEOPLE_COUNTS} placeholder="Câte persoane mergeți" />
          <FormSelect label="Venitul lunar" value={income} onChange={setIncome} options={INCOMES} placeholder="Selectează venitul" />

          <div className="grid grid-cols-2 gap-4">
            <FormSelect label="Orașul" value={city} onChange={setCity} options={CITIES} placeholder="Selectează" />
            <FormSelect label="Tipul locației" value={venueType} onChange={setVenueType} options={VENUE_TYPES} placeholder="Selectează" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormSelect label="Ziua evenimentului" value={day} onChange={setDay} options={DAYS} placeholder="Selectează" />
            <FormSelect label="Sezonul" value={season} onChange={setSeason} options={SEASONS} placeholder="Selectează" />
          </div>

          <Button
            onClick={calculate}
            disabled={!allFilled}
            className="w-full h-11 bg-gold text-background hover:bg-gold-dark text-sm font-semibold"
          >
            <Calculator className="mr-2 h-4 w-4" />
            Calculează suma
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="mt-6 border-gold/30">
          <CardHeader>
            <CardTitle className="text-center text-lg font-heading flex items-center justify-center gap-2">
              <Sparkles className="h-5 w-5 text-gold" />
              Rezultatul calculului
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-border/40 bg-accent/30 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Minim</p>
                <p className="text-2xl font-heading font-bold text-warning">{result.min}€</p>
                <p className="text-[10px] text-muted-foreground mt-1">Să nu fie jenă</p>
              </div>
              <div className="rounded-xl border-2 border-gold/40 bg-gold/5 p-4 text-center relative">
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gold px-2 py-0.5 text-[9px] font-bold text-background">
                  RECOMANDAT
                </div>
                <p className="text-xs text-muted-foreground mb-1 mt-1">Standard</p>
                <p className="text-3xl font-heading font-bold text-gold">{result.recommended}€</p>
                <p className="text-[10px] text-muted-foreground mt-1">Sumă potrivită</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-accent/30 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Generos</p>
                <p className="text-2xl font-heading font-bold text-success">{result.generous}€</p>
                <p className="text-[10px] text-muted-foreground mt-1">Impresionezi</p>
              </div>
            </div>

            <div className="rounded-lg bg-accent/30 p-4 text-center">
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Heart className="h-4 w-4 text-gold" />
                Această sumă este orientativă. Prezența ta contează mai mult decât suma.
              </p>
            </div>

            <div className="mt-6 rounded-lg border border-gold/20 bg-gold/5 p-4 text-center">
              <p className="text-sm font-medium">Organizezi o nuntă?</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Planifică totul gratuit pe ePetrecere.md — artiști, săli, checklist și buget.
              </p>
              <a
                href="/planifica"
                className="inline-block rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-background hover:bg-gold-dark"
              >
                Planifică Eveniment →
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
  options: { value: string; label: string }[];
  placeholder: string;
}) {
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
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
