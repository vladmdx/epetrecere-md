"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomCalendar } from "@/components/public/custom-calendar";
import { useLocale } from "@/hooks/use-locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ArrowRight, Loader2, Send, Sparkles,
  PartyPopper, Calendar, Users, Wrench, Building2, DollarSign, ClipboardCheck,
  Music, Mic, Disc3, Guitar, Camera, Video, Palette, Speaker, Star, Flame, Cake, LogIn,
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
  venueNeeded: "" | "yes" | "no"; // do they need a venue
  services: string[]; // selected category ids
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
  venueNeeded: "",
  services: [],
  budget: 2000,
  name: "",
  phone: "",
  email: "",
};

// Reordered per requirements: Sală (venue) BEFORE Servicii (categories)
// StepArtists removed — clients only pick categories, the artists are
// revealed after login on the results page.
const STEPS = [
  { key: "event_type", icon: PartyPopper },
  { key: "date", icon: Calendar },
  { key: "guests", icon: Users },
  { key: "venue", icon: Building2 },
  { key: "services", icon: Wrench },
  { key: "budget", icon: DollarSign },
  { key: "summary", icon: ClipboardCheck },
];

const TOTAL_STEPS = STEPS.length; // 7
const SUMMARY_INDEX = TOTAL_STEPS - 1; // 6

// ═══════════════════════════════════════════════
// WIZARD COMPONENT
// ═══════════════════════════════════════════════

interface WizardClientProps {
  /** When true, this is the admin-side wizard: skips auth gate and
   *  redirects to /admin/eveniment-nou/rezultate on completion. */
  adminMode?: boolean;
}

export function WizardClient({ adminMode = false }: WizardClientProps = {}) {
  const { t } = useLocale();
  const router = useRouter();
  const { isSignedIn, user } = useUser();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(initialData);
  const [submitting, setSubmitting] = useState(false);

  // Use a separate storage key for admin so both wizards can coexist
  const storageKey = adminMode ? "admin-wizard-data" : "wizard-data";
  const planIdKey = adminMode ? "admin-wizard-plan-id" : "wizard-plan-id";

  // Persist in sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      try { setData(JSON.parse(saved)); } catch { /* ignore */ }
    }
    // Reset any stale plan id when wizard starts fresh
    if (!saved) {
      sessionStorage.removeItem(planIdKey);
    }
  }, [storageKey, planIdKey]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, storageKey]);

  // Pre-fill name/email/phone when user is signed in
  useEffect(() => {
    if (isSignedIn && user) {
      setData((prev) => ({
        ...prev,
        name: prev.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || "",
        email: prev.email || user.primaryEmailAddress?.emailAddress || "",
        phone: prev.phone || user.primaryPhoneNumber?.phoneNumber?.replace(/^\+373/, "") || "",
      }));
    }
  }, [isSignedIn, user]);

  function update(partial: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  // All fields mandatory per M0a #4
  function canAdvance(): boolean {
    switch (step) {
      case 0: return !!data.eventType;
      case 1: return !!data.eventDate && !!data.location && !!data.timeSlot;
      case 2: return data.guestCount > 0;
      case 3: return data.venueNeeded === "yes" || data.venueNeeded === "no";
      case 4: return data.services.length > 0;
      case 5: return data.budget > 0;
      case 6: return !!data.name && !!data.phone;
      default: return false;
    }
  }

  function nextStep() {
    setStep((s) => Math.min(s + 1, SUMMARY_INDEX));
  }

  // Auto-advance with a short delay so the user sees their selection highlight
  function autoNext() {
    setTimeout(() => {
      // Use functional setState so we don't race on rapid auto-advances
      setStep((s) => Math.min(s + 1, SUMMARY_INDEX));
    }, 220);
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    // Public login gate (M0a #5). Admin mode skips this — admin is already
    // authenticated via the admin layout.
    if (!adminMode && !isSignedIn) {
      sessionStorage.setItem(storageKey, JSON.stringify(data));
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/planifica/rezultate")}`);
      return;
    }

    setSubmitting(true);
    try {
      // Admin flow: skip /api/leads (no need for CRM lead from admin-created
      // events) and go straight to results. The results page will create the
      // event plan from wizard data.
      if (adminMode) {
        router.push("/admin/eveniment-nou/rezultate");
        return;
      }

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
          message: `Categorii: ${data.services.join(", ")}${data.venueNeeded === "yes" ? " | Are nevoie de sală" : ""}`,
          wizardData: {
            services: data.services,
            venueNeeded: data.venueNeeded,
            timeSlot: data.timeSlot,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed");

      toast.success(t("form.submit_success"));
      router.push("/planifica/rezultate");
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
            {t(`wizard.step_${STEPS[step].key}`)} ({step + 1}/{TOTAL_STEPS})
          </p>
        </div>
      </div>

      {/* Step Content */}
      <div className="mx-auto max-w-2xl px-4 py-10">
        {step === 0 && <StepEventType data={data} update={update} autoNext={autoNext} />}
        {step === 1 && <StepDate data={data} update={update} autoNext={autoNext} />}
        {step === 2 && <StepGuests data={data} update={update} autoNext={autoNext} />}
        {step === 3 && <StepVenue data={data} update={update} autoNext={autoNext} />}
        {step === 4 && <StepServices data={data} update={update} />}
        {step === 5 && <StepBudget data={data} update={update} autoNext={autoNext} />}
        {step === 6 && <StepSummary data={data} update={update} isSignedIn={!!isSignedIn} />}

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

          {step < SUMMARY_INDEX ? (
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
              ) : adminMode || isSignedIn ? (
                <>
                  <Send className="h-4 w-4" /> Vezi rezultatele
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Autentifică-te pentru rezultate
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
  autoNext?: () => void;
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

function StepEventType({ data, update, autoNext }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_event_type")}</h2>
      <p className="mb-8 text-muted-foreground">Ce tip de eveniment planifici?</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {eventTypes.map((et) => (
          <button
            key={et.value}
            onClick={() => {
              update({ eventType: et.value });
              autoNext?.();
            }}
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

function StepDate({ data, update, autoNext }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_date")}</h2>
      <p className="mb-8 text-muted-foreground">Când și unde va avea loc evenimentul?</p>
      <div className="space-y-6">
        <div>
          <Label>{t("form.event_date")} *</Label>
          <div className="mt-1">
            <CustomCalendar
              value={data.eventDate ? new Date(data.eventDate + "T00:00:00") : null}
              onChange={(d) => {
                // Format to YYYY-MM-DD without timezone shift
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                update({ eventDate: `${y}-${m}-${day}` });
              }}
              placeholder={t("form.event_date")}
            />
          </div>
        </div>
        <div>
          <Label>{t("form.location")} *</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {cities.map((city) => (
              <button
                key={city}
                onClick={() => {
                  update({ location: city });
                  // Advance only once all three mandatory fields are filled
                  if (data.eventDate && data.timeSlot) autoNext?.();
                }}
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
          <Label>Interval orar *</Label>
          <div className="mt-2 flex gap-2">
            {["dimineață", "după-amiază", "seară"].map((slot) => (
              <button
                key={slot}
                onClick={() => {
                  update({ timeSlot: slot });
                  if (data.eventDate && data.location) autoNext?.();
                }}
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

function StepGuests({ data, update, autoNext }: StepProps) {
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
              onClick={() => {
                update({ guestCount: n });
                autoNext?.();
              }}
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

// Venue question — simple yes/no. If "yes" the results page will show
// available venues filtered by guestCount + city + date. If "no" we skip
// venue listings on results and focus on artists.
function StepVenue({ data, update, autoNext }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_venue")}</h2>
      <p className="mb-8 text-muted-foreground">Ai nevoie de o sală sau restaurant?</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => {
            update({ venueNeeded: "yes" });
            autoNext?.();
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 p-8 transition-all",
            data.venueNeeded === "yes"
              ? "border-gold bg-gold/10"
              : "border-border/40 hover:border-gold/30",
          )}
        >
          <Building2 className={cn("h-10 w-10", data.venueNeeded === "yes" ? "text-gold" : "text-muted-foreground")} />
          <span className="text-sm font-medium">Da, am nevoie de sală</span>
          <span className="text-xs text-muted-foreground">Vom afișa sălile disponibile pentru data ta</span>
        </button>
        <button
          onClick={() => {
            update({ venueNeeded: "no" });
            autoNext?.();
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 p-8 transition-all",
            data.venueNeeded === "no"
              ? "border-gold bg-gold/10"
              : "border-border/40 hover:border-gold/30",
          )}
        >
          <Sparkles className={cn("h-10 w-10", data.venueNeeded === "no" ? "text-gold" : "text-muted-foreground")} />
          <span className="text-sm font-medium">Nu, am deja o locație</span>
          <span className="text-xs text-muted-foreground">Am sala rezervată sau eveniment outdoor</span>
        </button>
      </div>
    </div>
  );
}

// Service / category picker. Renamed from "services" — per M0a the wizard
// collects *categories* of artists only; actual artist profiles are revealed
// post-login on the results page.
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
      <p className="mb-8 text-muted-foreground">
        Bifează categoriile de artiști dorite. După autentificare îți vom arăta doar artiștii liberi pentru data ta.
      </p>
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

const budgetPresets = [500, 1000, 2000, 3000, 5000, 10000];

function StepBudget({ data, update, autoNext }: StepProps) {
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
              onClick={() => {
                update({ budget: b });
                autoNext?.();
              }}
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

interface SummaryProps extends StepProps {
  isSignedIn: boolean;
}

function StepSummary({ data, update, isSignedIn }: SummaryProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_summary")}</h2>
      <p className="mb-8 text-muted-foreground">
        Verifică detaliile și completează datele de contact.
      </p>

      {/* Summary */}
      <div className="mb-8 space-y-3 rounded-xl border border-border/40 bg-card p-6">
        <SummaryRow label="Tip eveniment" value={t(`event_types.${data.eventType}`)} />
        <SummaryRow label="Data" value={data.eventDate} />
        <SummaryRow label="Locație" value={data.location} />
        {data.timeSlot && <SummaryRow label="Interval" value={data.timeSlot} />}
        <SummaryRow label="Invitați" value={String(data.guestCount)} />
        <SummaryRow label="Sală" value={data.venueNeeded === "yes" ? "Am nevoie de sală" : "Am deja locație"} />
        {data.services.length > 0 && (
          <SummaryRow
            label="Categorii"
            value={data.services.map((s) => serviceOptions.find((o) => o.id === s)?.label || s).join(", ")}
          />
        )}
        <SummaryRow label="Buget" value={`${data.budget.toLocaleString()}€`} />
      </div>

      {/* Login banner (M0a #5) */}
      {!isSignedIn && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <LogIn className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div>
            <p className="text-sm font-semibold">Autentificare obligatorie</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pentru a vedea prețurile și artiștii disponibili pentru data ta este necesară
              crearea unui cont. Durează mai puțin de un minut.
            </p>
          </div>
        </div>
      )}

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
