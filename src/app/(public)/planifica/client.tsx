"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocale } from "@/hooks/use-locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ArrowRight, Loader2, Send, Sparkles,
  PartyPopper, Calendar, Users, Wrench, Music, Building2, DollarSign, ClipboardCheck,
  Mic, Disc3, Guitar, Camera, Video, Palette, Speaker, Star, Flame, Cake,
} from "lucide-react";

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

interface WizardData {
  eventType: string;
  eventDate: string;
  location: string;
  timeSlot: string;
  guestCount: number;
  services: string[];
  selectedArtists: Record<string, number | null>; // service -> artistId or null
  venueChoice: "select" | "have" | "";
  selectedVenueId: number | null;
  budget: number;
  name: string;
  phone: string;
  email: string;
}

const initialData: WizardData = {
  eventType: "",
  eventDate: "",
  location: "",
  timeSlot: "",
  guestCount: 100,
  services: [],
  selectedArtists: {},
  venueChoice: "",
  selectedVenueId: null,
  budget: 2000,
  name: "",
  phone: "",
  email: "",
};

const STEPS = [
  { key: "event_type", icon: PartyPopper },
  { key: "date", icon: Calendar },
  { key: "guests", icon: Users },
  { key: "services", icon: Wrench },
  { key: "artists", icon: Music },
  { key: "venue", icon: Building2 },
  { key: "budget", icon: DollarSign },
  { key: "summary", icon: ClipboardCheck },
];

// ═══════════════════════════════════════════════
// WIZARD COMPONENT
// ═══════════════════════════════════════════════

export function WizardClient() {
  const { t } = useLocale();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(initialData);
  const [submitting, setSubmitting] = useState(false);

  // Persist in sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem("wizard-data");
    if (saved) {
      try { setData(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem("wizard-data", JSON.stringify(data));
  }, [data]);

  function update(partial: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 0: return !!data.eventType;
      case 1: return !!data.eventDate && !!data.location;
      case 2: return data.guestCount > 0;
      case 3: return true; // services optional
      case 4: return true; // artist selection optional
      case 5: return true; // venue optional
      case 6: return data.budget > 0;
      case 7: return !!data.name && !!data.phone;
      default: return false;
    }
  }

  // Skip artists step if no services selected
  function nextStep() {
    let next = step + 1;
    if (next === 4 && data.services.length === 0) next = 5; // skip artists
    if (next === 5 && !["wedding", "baptism", "cumpatrie", "birthday"].includes(data.eventType)) next = 6; // skip venue
    setStep(Math.min(next, 7));
  }

  function prevStep() {
    let prev = step - 1;
    if (prev === 5 && !["wedding", "baptism", "cumpatrie", "birthday"].includes(data.eventType)) prev = 4;
    if (prev === 4 && data.services.length === 0) prev = 3;
    setStep(Math.max(prev, 0));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          email: data.email || undefined,
          eventType: data.eventType,
          eventDate: data.eventDate,
          location: data.location,
          guestCount: data.guestCount,
          budget: data.budget,
          source: "wizard",
          message: `Servicii: ${data.services.join(", ")}`,
        }),
      });
      if (!res.ok) throw new Error("Failed");

      sessionStorage.removeItem("wizard-data");
      toast.success(t("form.submit_success"));
      router.push("/");
    } catch {
      toast.error("A apărut o eroare. Încercați din nou.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      {/* Progress Bar */}
      <div className="border-b border-border/40 bg-card/50">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center justify-between gap-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex flex-1 items-center">
                <button
                  onClick={() => i < step && setStep(i)}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-all",
                    i < step && "bg-gold text-background cursor-pointer",
                    i === step && "bg-gold text-background ring-4 ring-gold/20",
                    i > step && "bg-muted text-muted-foreground",
                  )}
                >
                  <s.icon className="h-4 w-4" />
                </button>
                {i < STEPS.length - 1 && (
                  <div className={cn("mx-1 h-0.5 flex-1 rounded", i < step ? "bg-gold" : "bg-muted")} />
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-sm font-medium text-muted-foreground">
            {t(`wizard.step_${STEPS[step].key}`)} ({step + 1}/8)
          </p>
        </div>
      </div>

      {/* Step Content */}
      <div className="mx-auto max-w-2xl px-4 py-10">
        {step === 0 && <StepEventType data={data} update={update} />}
        {step === 1 && <StepDate data={data} update={update} />}
        {step === 2 && <StepGuests data={data} update={update} />}
        {step === 3 && <StepServices data={data} update={update} />}
        {step === 4 && <StepArtists data={data} update={update} />}
        {step === 5 && <StepVenue data={data} update={update} />}
        {step === 6 && <StepBudget data={data} update={update} />}
        {step === 7 && <StepSummary data={data} update={update} />}

        {/* Navigation */}
        <div className="mt-10 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={step === 0}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> {t("common.back")}
          </Button>

          {step < 7 ? (
            <Button
              onClick={nextStep}
              disabled={!canAdvance()}
              className="gap-2 bg-gold text-background hover:bg-gold-dark"
            >
              {t("common.next")} <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canAdvance() || submitting}
              className="gap-2 bg-gold text-background hover:bg-gold-dark px-8"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" /> {t("common.submit")}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// STEP COMPONENTS
// ═══════════════════════════════════════════════

interface StepProps {
  data: WizardData;
  update: (partial: Partial<WizardData>) => void;
}

const eventTypes = [
  { value: "wedding", icon: "💒" },
  { value: "baptism", icon: "👶" },
  { value: "cumpatrie", icon: "🎉" },
  { value: "corporate", icon: "🏢" },
  { value: "birthday", icon: "🎂" },
  { value: "concert", icon: "🎵" },
  { value: "other", icon: "✨" },
];

function StepEventType({ data, update }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_event_type")}</h2>
      <p className="mb-8 text-muted-foreground">Ce tip de eveniment planifici?</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {eventTypes.map((et) => (
          <button
            key={et.value}
            onClick={() => update({ eventType: et.value })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-6 transition-all",
              data.eventType === et.value
                ? "border-gold bg-gold/10 text-gold"
                : "border-border/40 hover:border-gold/30",
            )}
          >
            <span className="text-3xl">{et.icon}</span>
            <span className="text-sm font-medium">{t(`event_types.${et.value}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const cities = ["Chișinău", "Bălți", "Cahul", "Orhei", "Ungheni", "Soroca", "Comrat", "Edineț"];

function StepDate({ data, update }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_date")}</h2>
      <p className="mb-8 text-muted-foreground">Când și unde va avea loc evenimentul?</p>
      <div className="space-y-6">
        <div>
          <Label>{t("form.event_date")} *</Label>
          <Input
            type="date"
            value={data.eventDate}
            onChange={(e) => update({ eventDate: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label>{t("form.location")} *</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {cities.map((city) => (
              <button
                key={city}
                onClick={() => update({ location: city })}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm transition-all",
                  data.location === city
                    ? "border-gold bg-gold/10 text-gold font-medium"
                    : "border-border/40 hover:border-gold/30",
                )}
              >
                {city}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Interval orar</Label>
          <div className="mt-2 flex gap-2">
            {["dimineață", "după-amiază", "seară"].map((slot) => (
              <button
                key={slot}
                onClick={() => update({ timeSlot: slot })}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm capitalize transition-all",
                  data.timeSlot === slot
                    ? "border-gold bg-gold/10 text-gold font-medium"
                    : "border-border/40 hover:border-gold/30",
                )}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const guestPresets = [50, 100, 150, 200, 300, 500];

function StepGuests({ data, update }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_guests")}</h2>
      <p className="mb-8 text-muted-foreground">Câți invitați aștepți?</p>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {guestPresets.map((n) => (
            <button
              key={n}
              onClick={() => update({ guestCount: n })}
              className={cn(
                "rounded-lg border px-5 py-3 text-sm font-medium transition-all",
                data.guestCount === n
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border/40 hover:border-gold/30",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div>
          <Label>Sau introdu numărul exact:</Label>
          <Input
            type="number"
            min={10}
            max={1000}
            value={data.guestCount}
            onChange={(e) => update({ guestCount: Number(e.target.value) })}
            className="mt-1 max-w-xs"
          />
        </div>
      </div>
    </div>
  );
}

const serviceOptions = [
  { id: "singer", label: "Cântăreț", icon: Music },
  { id: "mc", label: "Moderator / MC", icon: Mic },
  { id: "dj", label: "DJ", icon: Disc3 },
  { id: "photographer", label: "Fotograf", icon: Camera },
  { id: "videographer", label: "Videograf", icon: Video },
  { id: "band", label: "Formație / Band", icon: Guitar },
  { id: "show", label: "Show / Dans", icon: Star },
  { id: "decor", label: "Decor / Floristică", icon: Palette },
  { id: "candy_bar", label: "Candy Bar / Tort", icon: Cake },
  { id: "fireworks", label: "Foc de artificii", icon: Flame },
  { id: "animators", label: "Animatori", icon: PartyPopper },
  { id: "equipment", label: "Echipament tehnic", icon: Speaker },
];

function StepServices({ data, update }: StepProps) {
  const { t } = useLocale();

  function toggleService(id: string) {
    const current = data.services;
    const updated = current.includes(id)
      ? current.filter((s) => s !== id)
      : [...current, id];
    update({ services: updated });
  }

  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_services")}</h2>
      <p className="mb-8 text-muted-foreground">Ce servicii ai nevoie? (opțional)</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {serviceOptions.map((svc) => (
          <button
            key={svc.id}
            onClick={() => toggleService(svc.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all",
              data.services.includes(svc.id)
                ? "border-gold bg-gold/10"
                : "border-border/40 hover:border-gold/30",
            )}
          >
            <svc.icon className={cn("h-5 w-5 shrink-0", data.services.includes(svc.id) ? "text-gold" : "text-muted-foreground")} />
            <span className="text-sm font-medium">{svc.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepArtists({ data, update }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_artists")}</h2>
      <p className="mb-8 text-muted-foreground">
        Ai preferințe de artiști? Sau lasă la alegerea noastră.
      </p>
      <div className="space-y-4">
        {data.services.map((svc) => {
          const service = serviceOptions.find((s) => s.id === svc);
          return (
            <div key={svc} className="rounded-xl border border-border/40 bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{service?.label || svc}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs border-gold text-gold hover:bg-gold/10"
                  onClick={() => {
                    update({
                      selectedArtists: { ...data.selectedArtists, [svc]: null },
                    });
                  }}
                >
                  {t("wizard.let_us_choose")}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {data.selectedArtists[svc] === null
                  ? "✓ Vom selecta cel mai potrivit artist pentru tine"
                  : "Selectează un artist sau lasă la alegerea noastră"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepVenue({ data, update }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_venue")}</h2>
      <p className="mb-8 text-muted-foreground">Ai nevoie de o sală sau restaurant?</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => update({ venueChoice: "select" })}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 p-8 transition-all",
            data.venueChoice === "select"
              ? "border-gold bg-gold/10"
              : "border-border/40 hover:border-gold/30",
          )}
        >
          <Building2 className={cn("h-10 w-10", data.venueChoice === "select" ? "text-gold" : "text-muted-foreground")} />
          <span className="text-sm font-medium">Da, ajută-mă să aleg</span>
          <span className="text-xs text-muted-foreground">Vă vom sugera cele mai bune locații</span>
        </button>
        <button
          onClick={() => update({ venueChoice: "have" })}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 p-8 transition-all",
            data.venueChoice === "have"
              ? "border-gold bg-gold/10"
              : "border-border/40 hover:border-gold/30",
          )}
        >
          <Sparkles className={cn("h-10 w-10", data.venueChoice === "have" ? "text-gold" : "text-muted-foreground")} />
          <span className="text-sm font-medium">{t("wizard.have_venue")}</span>
          <span className="text-xs text-muted-foreground">Am deja sala rezervată</span>
        </button>
      </div>
    </div>
  );
}

const budgetPresets = [500, 1000, 2000, 3000, 5000, 10000];

function StepBudget({ data, update }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_budget")}</h2>
      <p className="mb-8 text-muted-foreground">{t("wizard.budget_info")}</p>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {budgetPresets.map((b) => (
            <button
              key={b}
              onClick={() => update({ budget: b })}
              className={cn(
                "rounded-lg border px-5 py-3 font-accent text-sm font-semibold transition-all",
                data.budget === b
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border/40 hover:border-gold/30",
              )}
            >
              {b.toLocaleString()}€
            </button>
          ))}
        </div>
        <div>
          <Label>Buget personalizat (EUR):</Label>
          <Input
            type="number"
            min={100}
            value={data.budget}
            onChange={(e) => update({ budget: Number(e.target.value) })}
            className="mt-1 max-w-xs"
          />
        </div>
      </div>
    </div>
  );
}

function StepSummary({ data, update }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_summary")}</h2>
      <p className="mb-8 text-muted-foreground">Verifică detaliile și completează datele de contact.</p>

      {/* Summary */}
      <div className="mb-8 space-y-3 rounded-xl border border-border/40 bg-card p-6">
        <SummaryRow label="Tip eveniment" value={t(`event_types.${data.eventType}`)} />
        <SummaryRow label="Data" value={data.eventDate} />
        <SummaryRow label="Locație" value={data.location} />
        {data.timeSlot && <SummaryRow label="Interval" value={data.timeSlot} />}
        <SummaryRow label="Invitați" value={String(data.guestCount)} />
        {data.services.length > 0 && (
          <SummaryRow
            label="Servicii"
            value={data.services.map((s) => serviceOptions.find((o) => o.id === s)?.label || s).join(", ")}
          />
        )}
        {data.venueChoice && (
          <SummaryRow label="Sală" value={data.venueChoice === "have" ? "Am deja" : "Ajutor la selecție"} />
        )}
        <SummaryRow label="Buget" value={`${data.budget.toLocaleString()}€`} />
      </div>

      {/* Contact Form */}
      <div className="space-y-4">
        <div>
          <Label>{t("form.name")} *</Label>
          <Input
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>{t("form.phone")} *</Label>
          <div className="flex gap-2">
            <Input value="+373" disabled className="w-20" />
            <Input
              value={data.phone}
              onChange={(e) => update({ phone: e.target.value })}
              type="tel"
              required
              className="flex-1"
            />
          </div>
        </div>
        <div>
          <Label>{t("form.email")}</Label>
          <Input
            value={data.email}
            onChange={(e) => update({ email: e.target.value })}
            type="email"
          />
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="gdpr-wizard" required />
          <Label htmlFor="gdpr-wizard" className="text-xs text-muted-foreground leading-tight">
            {t("form.gdpr_consent")}
          </Label>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
