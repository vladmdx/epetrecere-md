"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomCalendar } from "@/components/public/custom-calendar";
import { TimePicker } from "@/components/ui/time-picker";
import { ServiceIcon } from "@/components/public/service-icon";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowLeft, ArrowRight, Building2, Calendar, Camera, Check, ClipboardCheck, ClipboardList, Loader2, LogIn, PartyPopper, Send, Sparkles, Users, UtensilsCrossed, Wrench } from "lucide-react";
import { isCategoryAllowedForEvent } from "@/lib/wizard/categories-meta";
import { localizeMoldovaCity, MOLDOVA_CITIES } from "@/lib/moldova-cities";
import { useLocalizedRouter } from "@/components/shared/locale-link";
import { useLocalizePath } from "@/components/shared/locale-link";
import { PrivacyNotice } from "@/components/shared/privacy-notice";

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

interface WizardData {
  eventType: string;
  eventDate: string;
  location: string;
  /** Start hour "HH:MM" — replaces the older timeSlot enum. */
  startTime: string;
  /** Total duration in hours, defaulted per event type but user-editable. */
  durationHours: number;
  /** Legacy string ("dimineață" / "după-amiază" / "seară"). We keep it
   *  derived so older API callers (CRM message preview, email subject
   *  templates) don't have to change shape. Derived on every update. */
  timeSlot: string;
  guestCount: number;
  venueNeeded: "" | "yes" | "no"; // do they need a venue
  /** When venueNeeded === "yes", the maximum radius (km) from the
   *  event city the user is willing to travel for the venue. 0 = only
   *  the selected city, 999 = no limit. `null` means the user has not
   *  chosen yet — it cannot be 0, because 0 is a legitimate answer
   *  ("Doar în oraș") and would make an unanswered step look answered. */
  venueRadiusKm: number | null;
  services: string[]; // selected category ids
  /** Free-text venue name/address the client typed when they answered
   *  "Nu, am deja locație" on the venue step. Optional — empty string
   *  means the user skipped. Saved on the plan.notes column. */
  existingVenue: string;
  /** Event title — used as the plan title ("Nunta Ana & Ion"). Labelled
   *  "Nume eveniment" in the UI. Kept as `name` for back-compat with the
   *  leads + plan endpoints that already consumed this field. */
  name: string;
  phonePrefix: string;
  phone: string;
  email: string;
  /** GDPR checkbox — must be true before the wizard can submit. */
  gdprAccepted: boolean;
  /** Optional planning sections the user wants to use. Each toggles a
   *  tab on the plan dashboard; defaults are off so the user only sees
   *  what they asked for. Seating is auto-disabled if guests are off. */
  checklistEnabled: boolean;
  guestsEnabled: boolean;
  seatingEnabled: boolean;
  /** Photo Moments — turning this on activates the QR-driven guest photo
   *  gallery and pre-generates a public slug so the plan dashboard can
   *  immediately surface the share link and slideshow URL. Mirrors
   *  /cabinet/moments. */
  momentsEnabled: boolean;
}

/** Typical event durations in hours. The user still picks a start hour
 *  and can override the duration, but we default to realistic windows
 *  so the "rezervare artist" modal auto-fills sensible start/end times. */
const DEFAULT_DURATION_HOURS: Record<string, number> = {
  wedding: 10,
  proposal: 2,
  cununie: 2,
  baptism: 6,
  cumatrie: 6,
  birthday: 5,
  kids_birthday: 3,
  corporate: 4,
  concert: 3,
  other: 5,
};

/** Reasonable default start hour per event type. */
const DEFAULT_START_TIME: Record<string, string> = {
  wedding: "14:00",
  proposal: "19:00",
  cununie: "11:00",
  baptism: "12:00",
  cumatrie: "17:00",
  birthday: "18:00",
  kids_birthday: "12:00",
  corporate: "18:00",
  concert: "19:00",
  other: "18:00",
};

/**
 * Default guest counts per event type. Wedding is the only one that
 * routinely runs to ~150; family events (botez, cumătrie, zi de naștere)
 * tend to be 30–50; corporate/concerts vary a lot but skew smaller for
 * private setups.
 */
const DEFAULT_GUEST_COUNT: Record<string, number> = {
  wedding: 150,
  proposal: 2,
  cununie: 30,
  baptism: 40,
  cumatrie: 50,
  birthday: 30,
  kids_birthday: 20,
  corporate: 50,
  concert: 60,
  other: 40,
};

function deriveTimeSlot(startTime: string): string {
  if (!startTime) return "";
  const [h] = startTime.split(":").map(Number);
  if (Number.isNaN(h)) return "";
  if (h < 12) return "dimineață";
  if (h < 18) return "după-amiază";
  return "seară";
}

const initialData: WizardData = {
  eventType: "",
  eventDate: "",
  location: "Chișinău",
  startTime: "",
  durationHours: 5,
  timeSlot: "",
  guestCount: 100,
  venueNeeded: "",
  venueRadiusKm: null,
  services: [],
  existingVenue: "",
  name: "",
  phonePrefix: "+373",
  phone: "",
  email: "",
  gdprAccepted: false,
  checklistEnabled: false,
  guestsEnabled: false,
  seatingEnabled: false,
  momentsEnabled: false,
};

// Reordered per requirements: Sală (venue) BEFORE Servicii (categories)
// StepArtists removed — clients only pick categories, the artists are
// revealed after login on the results page.
// Budget step removed — budget is no longer part of event planning.
const STEPS = [
  { key: "event_type", labelKey: "wizard.steps.eventType", icon: PartyPopper },
  { key: "date", labelKey: "wizard.steps.date", icon: Calendar },
  { key: "guests", labelKey: "wizard.step_guests", icon: Users },
  { key: "venue", labelKey: "wizard.step_venue", icon: Building2 },
  { key: "services", labelKey: "wizard.step_services", icon: Wrench },
  { key: "extras", labelKey: "wizard.steps.extras", icon: ClipboardList },
  { key: "summary", labelKey: "wizard.steps.confirm", icon: ClipboardCheck },
];

const TOTAL_STEPS = STEPS.length; // 7
const SUMMARY_INDEX = TOTAL_STEPS - 1; // 6

// ═══════════════════════════════════════════════
// WIZARD COMPONENT
// ═══════════════════════════════════════════════

export type CategoryRow = {
  id: number;
  slug: string;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  type: "artist" | "service" | "venue";
  sortOrder?: number | null;
};

interface WizardClientProps {
  /** When true, this is the admin-side wizard: skips auth gate and
   *  redirects to /admin/eveniment-nou/rezultate on completion. */
  adminMode?: boolean;
  /** Categories rendered by the services step and named in the summary.
   *  Supplied by the server component so the step is instant — it used to
   *  fetch /api/categories only once the user had already arrived on it,
   *  which is why the list took seconds to appear. */
  categories?: CategoryRow[];
}

export function WizardClient({ adminMode = false, categories: initialCategories = [] }: WizardClientProps = {}) {
  const { t } = useLocale();
  const lp = useLocalizePath();
  const router = useLocalizedRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, user } = useUser();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(initialData);
  const [submitting, setSubmitting] = useState(false);
  /** Why "Continuă" refused, shown next to the button. */
  const [stepError, setStepError] = useState<string | null>(null);
  const stepErrorRef = useRef<HTMLDivElement | null>(null);

  // Use a separate storage key for admin so both wizards can coexist
  const storageKey = adminMode ? "admin-wizard-data" : "wizard-data";
  const planIdKey = adminMode ? "admin-wizard-plan-id" : "wizard-plan-id";

  // Persist in sessionStorage. URL params (from the homepage search bar
  // funnel) take precedence on first hydration so /planifica?eventType=
  // wedding lands on step 0 with Nuntă pre-selected.
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    let next = initialData;
    if (saved) {
      try {
        next = { ...next, ...JSON.parse(saved) };
      } catch {
        /* ignore */
      }
    } else {
      sessionStorage.removeItem(planIdKey);
    }
    const eventType = searchParams.get("eventType");
    if (eventType) {
      next.eventType = eventType;
      // Mirror the per-event-type defaults that update() applies in the
      // normal click path. Without this, prefill from the homepage
      // funnel arrived on step 1 with the time blank and duration at
      // the global default — losing the per-event tuning the wizard
      // gives interactive users.
      if (!next.startTime) {
        next.startTime = DEFAULT_START_TIME[eventType] ?? "18:00";
      }
      if (next.durationHours === initialData.durationHours) {
        next.durationHours = DEFAULT_DURATION_HOURS[eventType] ?? 5;
      }
      if (next.guestCount === initialData.guestCount) {
        next.guestCount = DEFAULT_GUEST_COUNT[eventType] ?? 50;
      }
    }
    const city = searchParams.get("city");
    if (city) next.location = city;
    const date = searchParams.get("date");
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) next.eventDate = date;
    if (eventType || city || date) {
      // When the user came from the homepage search, jump them past the
      // first step (event type) since they already picked it. They land
      // on step 1 (date) with the date prefilled too.
      setStep((s) => (s === 0 && eventType ? 1 : s));
    }
    setData(next);
    // Run only on mount — search params change after navigation should
    // not silently rewrite the wizard mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, planIdKey]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, storageKey]);

  // Pre-fill email/phone when user is signed in. We DO NOT pre-fill `name`
  // — that field is the *event* title (e.g. "Nunta Ana & Ion"), not the
  // user's full name. Leaving it empty lets the placeholder guide the
  // owner to enter an event-style title.
  useEffect(() => {
    if (isSignedIn && user) {
      setData((prev) => ({
        ...prev,
        email: prev.email || user.primaryEmailAddress?.emailAddress || "",
        phone: prev.phone || user.primaryPhoneNumber?.phoneNumber?.replace(/^\+373/, "") || "",
      }));
    }
  }, [isSignedIn, user]);

  function update(partial: Partial<WizardData>) {
    setData((prev) => {
      const next = { ...prev, ...partial };
      // When the event type changes, suggest a start time, duration and
      // guest count. Don't overwrite values the user already typed manually.
      if (partial.eventType && partial.eventType !== prev.eventType) {
        if (!prev.startTime) {
          next.startTime = DEFAULT_START_TIME[partial.eventType] ?? "18:00";
        }
        // Always refresh the duration on event-type change so the default
        // for the new type takes effect (user can still override).
        next.durationHours =
          DEFAULT_DURATION_HOURS[partial.eventType] ?? 5;
        // Refresh guest count similarly. Only "wedding" gets the high
        // default — botez/cumătrie/zi-de-naștere etc. start much smaller.
        next.guestCount = DEFAULT_GUEST_COUNT[partial.eventType] ?? 50;
      }
      // Keep the legacy timeSlot derived so email templates and CRM
      // previews ("seară", "după-amiază") keep working.
      if (partial.startTime !== undefined) {
        next.timeSlot = deriveTimeSlot(partial.startTime);
      } else if (!next.timeSlot && next.startTime) {
        next.timeSlot = deriveTimeSlot(next.startTime);
      }
      return next;
    });
  }

  // All fields mandatory per M0a #4.
  //
  // This returns the REASON the step is incomplete rather than a bare
  // boolean, because a disabled "Continuă" with no explanation is how the
  // radius step came to look optional: users answered "Da, am nevoie de
  // sală", never scrolled to the radius picker below the fold, and were
  // left staring at a dead button. Every step now says what is missing.
  function blockReason(): string | null {
    switch (step) {
      case 0:
        return data.eventType ? null : t("wizard.required_event_type");
      case 1:
        if (!data.eventDate) return t("wizard.required_date");
        if (!data.location) return t("wizard.required_city");
        if (!data.startTime) return t("wizard.required_start_time");
        if (!(data.durationHours > 0)) return t("wizard.required_duration");
        return null;
      case 2:
        return data.guestCount > 0 ? null : t("wizard.required_guests");
      case 3:
        if (data.venueNeeded !== "yes" && data.venueNeeded !== "no") {
          return t("wizard.required_venue");
        }
        // The radius only exists once they said they need a venue.
        if (data.venueNeeded === "yes" && data.venueRadiusKm == null) {
          return t("wizard.required_radius");
        }
        return null;
      case 4:
        return data.services.length > 0 ? null : t("wizard.required_services");
      case 5:
        return null; // extras step — every choice is valid (including all "no")
      case 6:
        // The summary step now only asks for the event title — phone /
        // email / GDPR were collected at sign-up. Unauthenticated users
        // get bounced through the sign-in gate inside handleSubmit.
        return data.name.trim() ? null : t("wizard.required_name");
      default:
        return t("wizard.required_generic");
    }
  }

  function canAdvance(): boolean {
    return blockReason() === null;
  }

  // Clear the "you must pick X" message as soon as the user changes
  // anything or moves step — a stale error is worse than none.
  useEffect(() => {
    setStepError(null);
  }, [step, data]);

  useEffect(() => {
    if (stepError) {
      stepErrorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [stepError]);

  // Reset scroll on step change so the user always sees the wizard header,
  // not whichever halfway-down position the previous step left them at —
  // critical on mobile where the steps indicator scrolls off-screen.
  function scrollWizardTop() {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }

  function nextStep() {
    setStep((s) => Math.min(s + 1, SUMMARY_INDEX));
    scrollWizardTop();
  }

  // Auto-advance with a short delay so the user sees their selection highlight
  function autoNext() {
    setTimeout(() => {
      // Use functional setState so we don't race on rapid auto-advances
      setStep((s) => Math.min(s + 1, SUMMARY_INDEX));
      scrollWizardTop();
    }, 220);
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0));
    scrollWizardTop();
  }

  async function handleSubmit() {
    // The summary step only asks for the event title now — phone, email
    // and GDPR consent come from the user's account (collected at signup).
    if (!data.name.trim()) {
      toast.error(t("wizard.toastNameRequired"));
      return;
    }

    // Public login gate (M0a #5). Admin mode skips this — admin is already
    // authenticated via the admin layout. Unauthenticated public users are
    // sent to sign-in and /planifica/rezultate takes over after login.
    if (!adminMode && !isSignedIn) {
      sessionStorage.setItem(storageKey, JSON.stringify(data));
      router.push(`/sign-in?redirect_url=${encodeURIComponent(lp("/planifica/rezultate"))}`);
      return;
    }

    setSubmitting(true);
    try {
      // Admin flow: skip /api/leads and land on the admin results page.
      if (adminMode) {
        router.push("/admin/eveniment-nou/rezultate");
        return;
      }

      // Use the signed-in user's contact info — collected at sign-up,
      // no need to re-ask. Full phone uses Clerk's E.164 format directly.
      const accountPhone =
        user?.primaryPhoneNumber?.phoneNumber || data.phone || "";
      const accountEmail =
        user?.primaryEmailAddress?.emailAddress || data.email || undefined;

      // Authenticated client flow: record the lead (fire-and-forget so the
      // user isn't blocked if the CRM insert fails), then materialize the
      // event plan and deep-link into its "Rezervări Artiști" tab so the
      // user immediately sees the available artists for their date.
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: accountPhone,
          email: accountEmail,
          eventType: data.eventType,
          eventDate: data.eventDate,
          location: data.location,
          guestCount: data.guestCount,
          source: "wizard",
          message: `Categorii: ${data.services.join(", ")}${data.venueNeeded === "yes" ? " | Are nevoie de sală" : ""}`,
          wizardData: {
            services: data.services,
            venueNeeded: data.venueNeeded,
            // The exact interval, not just the coarse bucket. venueRadiusKm
            // was collected on step 3 and previously discarded here.
            startTime: data.startTime,
            durationHours: data.durationHours,
            endTime: computeEndTime(data.startTime, data.durationHours),
            venueRadiusKm: data.venueRadiusKm,
            timeSlot: data.timeSlot,
          },
        }),
      }).catch(() => { /* non-fatal */ });

      const planRes = await fetch("/api/event-plans/from-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (planRes.ok) {
        const payload = await planRes.json();
        const planId = payload?.plan?.id;
        if (planId) {
          sessionStorage.setItem(planIdKey, String(planId));
          toast.success(t("form.submit_success"));
          // Land on Săli first if the user said they need a venue — that
          // matches the new tab order (Săli before Rezervări Artiști).
          // Otherwise jump straight to Rezervări Artiști.
          const initialTab = data.venueNeeded === "yes" ? "venues" : "bookings";
          router.push(`/cabinet/planifica/${planId}?tab=${initialTab}`);
          return;
        }
      }

      // Fallback — couldn't create plan, still show the old results page.
      toast.success(t("form.submit_success"));
      router.push("/planifica/rezultate");
    } catch {
      toast.error(t("wizard.toastError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_16%_16%,rgba(47,53,153,.17),transparent_27%),radial-gradient(circle_at_86%_42%,rgba(9,68,122,.13),transparent_26%),linear-gradient(145deg,#080b16,#020814_64%,#07101c)] text-[#f5efe4]">
      {/* Progress Bar */}
      <div className="border-b border-[#e6b84d]/10 bg-[#050914]/64 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl overflow-x-auto px-4 py-6">
          <div className="flex min-w-[760px] items-start justify-between gap-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex flex-1 items-start">
                <button
                  onClick={() => i < step && setStep(i)}
                  className={cn(
                    "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-all",
                    i < step && "cursor-pointer border-[#e6b84d] bg-[#0b111c] text-[#e6b84d]",
                    i === step && "border-[#f0c85f] bg-[#15140f] text-[#f0c85f] shadow-[0_0_25px_rgba(230,184,77,.34)] ring-4 ring-[#e6b84d]/8",
                    i > step && "border-white/15 bg-[#111521]/82 text-white/43",
                  )}
                >
                  {i < step ? <Check className="h-5 w-5" /> : <s.icon className="h-4 w-4" />}
                  <span className={cn(
                    "absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px]",
                    i <= step ? "text-[#e6b84d]" : "text-white/45",
                  )}>
                    {i + 1}
                  </span>
                  <span className="absolute -bottom-11 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-normal text-white/58">
                    {t(s.labelKey)}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={cn("mx-2 mt-6 h-px flex-1", i < step ? "bg-[#e6b84d]" : "bg-white/13")} />
                )}
              </div>
            ))}
          </div>
          <div className="h-10" />
        </div>
      </div>

      {/* Step Content */}
      <div className="mx-auto max-w-6xl px-4 py-9 lg:px-8">
        {step === 0 && <StepEventType data={data} update={update} autoNext={autoNext} />}
        {step === 1 && <StepDate data={data} update={update} autoNext={autoNext} />}
        {step === 2 && <StepGuests data={data} update={update} autoNext={autoNext} />}
        {step === 3 && <StepVenue data={data} update={update} autoNext={autoNext} />}
        {step === 4 && <StepServices data={data} update={update} allCategories={initialCategories} />}
        {step === 5 && <StepExtras data={data} update={update} />}
        {step === 6 && <StepSummary data={data} update={update} isSignedIn={!!isSignedIn} allCategories={initialCategories} />}

        {/* Why the step will not advance. Rendered above the buttons and
            scrolled into view, so the answer is next to the control the
            user just pressed rather than somewhere off-screen. */}
        {stepError ? (
          <div
            ref={stepErrorRef}
            role="alert"
            aria-live="polite"
            className="mt-6 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{stepError}</span>
          </div>
        ) : null}

        {/* Navigation. On mobile the page used to end flush with the
            viewport bottom — Safari/Chrome's UI bar covered the
            Continuă button. Pad with `pb-28` + safe-area inset so the
            CTA always clears the browser chrome. */}
        {step === SUMMARY_INDEX ? (
          <PrivacyNotice context="planner" className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-white/55" />
        ) : null}
        <div
          className="mt-5 flex items-center justify-between gap-3 pb-28 sm:pb-10"
          style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom))" }}
        >
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={step === 0}
            className="gap-2 border-white/18 bg-transparent text-white/72 hover:border-[#e6b84d]/45 hover:bg-[#e6b84d]/8 hover:text-[#e6b84d]"
          >
            <ArrowLeft className="h-4 w-4" /> {t("common.back")}
          </Button>

          {step < SUMMARY_INDEX ? (
            <Button
              onClick={() => {
                const reason = blockReason();
                if (reason) {
                  setStepError(reason);
                  return;
                }
                setStepError(null);
                nextStep();
              }}
              className="min-w-36 gap-2 bg-[linear-gradient(135deg,#f0ce72,#d8a63c)] text-[#07101d] hover:brightness-105"
            >
              {t("common.next")} <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canAdvance() || submitting}
              className="gap-2 bg-[linear-gradient(135deg,#f0ce72,#d8a63c)] px-8 text-[#07101d] hover:brightness-105"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : adminMode || isSignedIn ? (
                <>
                  <Send className="h-4 w-4" /> {t("wizard.seeResults")}
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> {t("wizard.signInForResults")}
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

function WizardStepHeading({
  step,
  title,
  accent,
  description,
}: {
  step: number;
  title: string;
  accent?: string;
  description: string;
}) {
  const { t } = useLocale();
  return (
    <div className="mb-7 text-center">
      <div className="mb-4 flex items-center justify-center gap-4 text-xs font-semibold text-[#e6b84d]">
        <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#e6b84d]/45" />
        {t("wizard.stepOf", { step, total: TOTAL_STEPS })}
        <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#e6b84d]/45" />
      </div>
      <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
        {title} {accent && <span className="text-[#e6b84d]">{accent}</span>}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-white/62 sm:text-base">
        {description}
      </p>
    </div>
  );
}

// Event type cards use the same visual style as the homepage CategoriesSection:
// real background photo + dark gradient overlay + label. Files in
// /public/images/event-types/[slug].jpg — admin can replace any without
// touching this code.
// Order and membership follow ALL_EVENT_TYPES; only the photo lives here.
// Each event uses a distinct, relevant photo. Versioned paths also invalidate
// previously cached copies of the three duplicated photographs.
const eventTypes = [
  { value: "wedding", image: "/images/redesign/event-wedding.webp" },
  { value: "proposal", image: "/images/redesign/event-proposal-2026.webp" },
  { value: "cununie", image: "/images/redesign/event-cununie-2026.webp" },
  { value: "baptism", image: "/images/redesign/event-baptism.webp" },
  { value: "cumatrie", image: "/images/redesign/event-cumatrie-2026.webp" },
  { value: "birthday", image: "/images/redesign/event-birthday.webp" },
  { value: "kids_birthday", image: "/images/redesign/event-kids-birthday-2026.webp" },
  { value: "corporate", image: "/images/redesign/event-corporate.webp" },
  { value: "concert", image: "/images/redesign/event-concert.webp" },
  { value: "other", image: "/images/redesign/event-other.webp" },
];

function StepEventType({ data, update, autoNext }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <WizardStepHeading
        step={1}
        title={t("wizard.eventType.title")}
        accent={t("wizard.eventType.accent")}
        description={t("wizard.eventType.desc")}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-12">
        {eventTypes.map((et, index) => {
          const selected = data.eventType === et.value;
          return (
            <button
              key={et.value}
              onClick={() => {
                update({ eventType: et.value });
                autoNext?.();
              }}
              className={cn(
                "group relative col-span-1 aspect-[4/3] overflow-hidden rounded-xl border transition-all lg:col-span-3",
                index >= 4 && "lg:col-span-4",
                selected
                  ? "border-[#efc75c] shadow-[0_10px_34px_rgba(230,184,77,.16)] ring-2 ring-[#e6b84d]/20"
                  : "border-white/15 hover:border-[#e6b84d]/55",
              )}
            >
              {/* Background image */}
              <img
                src={et.image}
                alt={t(`event_types.${et.value}`)}
                className={cn(
                  "absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
                  selected && "scale-105",
                )}
                loading="lazy"
              />
              {/* Gradient overlay — concentrated at the bottom only so the
                  top half of each photo stays visible. The previous
                  full-card via-black/40 layer washed out the photos
                  entirely; matching the homepage CategoriesSection style. */}
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              {selected && (
                <>
                  <div className="absolute inset-0 bg-[#e6b84d]/8" />
                  <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f2d378,#d9a83e)] text-[#08111d] shadow-lg">
                    <Check className="h-4 w-4" />
                  </span>
                </>
              )}
              {/* Label */}
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                <span
                  className={cn(
                    "font-heading text-lg font-semibold sm:text-xl",
                    selected ? "text-[#f1cf76]" : "text-white",
                  )}
                >
                  {t(`event_types.${et.value}`)}
                </span>
                <span className="mt-2 block h-px w-5 bg-[#e6b84d]" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Source-of-truth list of localities lives in @/lib/moldova-cities.ts so
// every picker (wizard, /dashboard/setari, onboarding) stays in sync.

/** Shown below the duration field as quick-pick presets. Wedding gets
 *  the "all day" helper; everything else shows sensible alternatives so
 *  the user doesn't have to type. */
const DURATION_PRESETS: Record<string, number[]> = {
  wedding: [8, 10, 12],
  baptism: [4, 5, 6, 8],
  cumatrie: [4, 6, 8],
  birthday: [3, 4, 5, 6, 8],
  corporate: [2, 3, 4, 6],
  concert: [2, 3, 4],
  other: [3, 5, 7, 10],
};

function computeEndTime(startTime: string, durationHours: number): string {
  if (!startTime || !durationHours) return "";
  const [h, m] = startTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const endH = (h + durationHours) % 24;
  return `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function StepDate({ data, update }: StepProps) {
  const { locale, t } = useLocale();
  const presets =
    DURATION_PRESETS[data.eventType] ?? DURATION_PRESETS.other;
  const endTime = computeEndTime(data.startTime, data.durationHours);

  return (
    <div>
      <WizardStepHeading
        step={2}
        title={t("wizard.date.title")}
        accent={t("wizard.date.accent")}
        description={t("wizard.date.desc")}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-xl border border-[#e6b84d]/35 bg-[#0b101b]/72 p-5 shadow-[0_20px_55px_rgba(0,0,0,.2)] backdrop-blur sm:p-7">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <Label className="text-white/82">{t("form.event_date")} *</Label>
              <div className="mt-2 [&_button]:border-white/15 [&_button]:bg-[#0b1019] [&_button]:text-white">
                <CustomCalendar
                  value={data.eventDate ? new Date(data.eventDate + "T00:00:00") : null}
                  onChange={(d) => {
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
              <Label className="text-white/82">{t("form.location")} *</Label>
              <select
                value={data.location || "Chișinău"}
                onChange={(e) => update({ location: e.target.value })}
                className="mt-2 h-11 w-full rounded-lg border border-[#e6b84d]/28 bg-[#0b1019] px-3 text-sm text-white outline-none focus:border-[#e6b84d]/65"
              >
                {MOLDOVA_CITIES.map((city) => (
                  <option key={city} value={city}>{localizeMoldovaCity(city, locale)}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-white/42">
                {t("wizard.date.cityHint")}
              </p>
            </div>

            <div>
              <Label className="text-white/82">{t("wizard.date.startTime")} *</Label>
              <div className="mt-2 [&_button]:border-[#e6b84d]/28 [&_button]:bg-[#0b1019]">
                <TimePicker
                  value={data.startTime}
                  onChange={(v) => update({ startTime: v })}
                />
              </div>
            </div>

            <div>
              <Label className="text-white/82">{t("wizard.date.duration")} *</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={data.durationHours}
                onChange={(e) => update({ durationHours: Number(e.target.value) || 0 })}
                className="mt-2 border-[#e6b84d]/28 bg-[#0b1019] text-white"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {presets.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => update({ durationHours: h })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px] transition-all",
                      data.durationHours === h
                        ? "border-[#e6b84d] bg-[#e6b84d]/12 font-medium text-[#e6b84d]"
                        : "border-white/16 text-white/62 hover:border-[#e6b84d]/35",
                    )}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          {endTime && (
            <div className="mt-6 flex items-center gap-3 rounded-lg border border-[#e6b84d]/25 bg-[linear-gradient(90deg,rgba(230,184,77,.11),rgba(230,184,77,.05))] px-4 py-3 text-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e6b84d]/12 text-[#e6b84d]">
                <Calendar className="h-4 w-4" />
              </span>
              <span className="text-white/58">{t("wizard.date.interval")}</span>
              <span className="font-semibold text-[#e6b84d]">
                {data.startTime} – {endTime}
              </span>
              <span className="text-white/48">({data.durationHours}h)</span>
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-white/16 bg-[#0b101b]/64 px-5 py-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#e6b84d]/45 bg-[#e6b84d]/7 text-[#e6b84d] shadow-[0_0_28px_rgba(230,184,77,.12)]">
            <Calendar className="h-7 w-7" />
          </div>
          <p className="mt-5 font-heading text-xl leading-tight text-white/82">
            {t("wizard.date.asideBefore")}{" "}
            <span className="block text-[#e6b84d]">{t("wizard.date.asideAccent")}</span>{" "}
            {t("wizard.date.asideAfter")}
          </p>
        </aside>
      </div>
    </div>
  );
}

/** Quick-pick guest counts. The lower bucket (20/40) is now visible
 *  because most events on the platform aren't weddings — botez and
 *  cumătrie are typically 30–50 guests. */
const guestPresets = [20, 40, 60, 100, 150, 300];

function StepGuests({ data, update, autoNext }: StepProps) {
  const { t } = useLocale();
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_guests")}</h2>
      <p className="mb-8 text-muted-foreground">{t("wizard.guests.question")}</p>
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
          <Label>{t("wizard.guests.exact")}</Label>
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
const VENUE_RADIUS_PRESETS: Array<{ value: number; labelKey: string; subKey?: string }> = [
  { value: 0, labelKey: "wizard.venue.radius0", subKey: "wizard.venue.radius0Sub" },
  { value: 25, labelKey: "wizard.venue.radius25", subKey: "wizard.venue.radius25Sub" },
  { value: 50, labelKey: "wizard.venue.radius50", subKey: "wizard.venue.radius50Sub" },
  { value: 100, labelKey: "wizard.venue.radius100", subKey: "wizard.venue.radius100Sub" },
  { value: 999, labelKey: "wizard.venue.radiusAll", subKey: "wizard.venue.radiusAllSub" },
];

function StepVenue({ data, update }: StepProps) {
  const { t } = useLocale();
  const radiusSectionRef = useRef<HTMLDivElement | null>(null);
  // Auto-advance removed — when user picks "Yes" they must also choose a
  // radius, so we keep them on this step until they hit "Continuă".

  // On small screens the "Da, am nevoie de sală" card sits above the fold
  // but the radius picker that appears below the cards is off-screen —
  // users tap "Yes" and think the page is stuck. Auto-scroll the radius
  // section into view so the next required choice is visible.
  function pickYes() {
    update({ venueNeeded: "yes" });
    requestAnimationFrame(() => {
      radiusSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_venue")}</h2>
      <p className="mb-8 text-muted-foreground">{t("wizard.venue.question")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={pickYes}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 p-8 transition-all",
            data.venueNeeded === "yes"
              ? "border-gold bg-gold/10"
              : "border-border/40 hover:border-gold/30",
          )}
        >
          <Building2 className={cn("h-10 w-10", data.venueNeeded === "yes" ? "text-gold" : "text-muted-foreground")} />
          <span className="text-sm font-medium">{t("wizard.venue.yes")}</span>
          <span className="text-xs text-muted-foreground">{t("wizard.venue.yesDesc")}</span>
        </button>
        <button
          onClick={() => update({ venueNeeded: "no" })}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 p-8 transition-all",
            data.venueNeeded === "no"
              ? "border-gold bg-gold/10"
              : "border-border/40 hover:border-gold/30",
          )}
        >
          <Sparkles className={cn("h-10 w-10", data.venueNeeded === "no" ? "text-gold" : "text-muted-foreground")} />
          <span className="text-sm font-medium">{t("wizard.venue.no")}</span>
          <span className="text-xs text-muted-foreground">{t("wizard.venue.noDesc")}</span>
        </button>
      </div>

      {/* When the user already has a venue, ask for an optional name +
          address so artists know where to show up. Stored on plan.notes
          and surfaced in the booking-request message. Skipping it is
          fine — partners can always ask via chat. */}
      {data.venueNeeded === "no" && (
        <div className="mt-8 space-y-2">
          <Label>{t("wizard.venue.existingLabel")}</Label>
          <Input
            value={data.existingVenue}
            onChange={(e) => update({ existingVenue: e.target.value })}
            placeholder={t("wizard.venue.existingPlaceholder")}
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground">
            {t("wizard.venue.existingHint")}
          </p>
        </div>
      )}

      {/* Radius picker — only when the user wants a venue. We use radius
          brackets instead of a real slider because Moldovan cities are
          well-covered by a handful of distance buckets and this keeps
          the UI honest (we don't have lat/lng on venue rows). */}
      {data.venueNeeded === "yes" && (
        <div className="mt-8 scroll-mt-20" ref={radiusSectionRef}>
          <Label>{t("wizard.venue.radiusLabel")} *</Label>
          <p className="mb-3 text-xs text-muted-foreground">
            {t("wizard.venue.radiusHint", {
              city: data.location || t("wizard.venue.radiusFallbackCity"),
            })}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {VENUE_RADIUS_PRESETS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ venueRadiusKm: opt.value })}
                className={cn(
                  "rounded-lg border-2 px-3 py-3 text-left transition-all",
                  data.venueRadiusKm === opt.value
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-border/40 hover:border-gold/30",
                )}
              >
                <p className="text-sm font-medium">{t(opt.labelKey)}</p>
                {opt.subKey && (
                  <p className="text-[11px] text-muted-foreground">{t(opt.subKey)}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Service / category picker. Renamed from "services" — per M0a the wizard
// collects *categories* of artists only; actual artist profiles are revealed
// post-login on the results page.
//
// Until 2026-04 this step rendered a hand-curated list of 12 generic IDs
// ("singer", "dj", ...) which silently dropped half the actual DB categories
// (Striptiz, Moș Crăciun, Stand Up, Iluzioniști, etc.) and showed all options
// for every event type — Stand Up at a baptism, etc. Now we:
//   1. Fetch all live categories from /api/categories (= what artist.md has)
//   2. Use the slug as the wizard service id (no aliasing layer needed)
//   3. Filter by event type via CATEGORY_META.allowedEventTypes
function StepServices({ data, update, allCategories }: StepProps & { allCategories: CategoryRow[] }) {
  const { locale, t } = useLocale();
  const [categories, setCategories] = useState<CategoryRow[]>(() =>
    allCategories.filter((c) => c.type === "artist" || c.type === "service"),
  );
  const [loadingCats, setLoadingCats] = useState(allCategories.length === 0);

  useEffect(() => {
    // Server-rendered list already covers the normal path; this only runs
    // for the admin wizard, which mounts without one.
    if (allCategories.length > 0) return;
    let alive = true;
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (!alive) return;
        const list: CategoryRow[] = Array.isArray(data)
          ? (data as CategoryRow[])
          : ((data as { items?: CategoryRow[] })?.items ?? []);
        // Wizard step picks ARTIST + SERVICE categories. Venues are picked
        // in their own step (StepVenue).
        setCategories(
          list.filter((c) => c.type === "artist" || c.type === "service"),
        );
      })
      .catch(() => {
        /* silent — empty list will show below */
      })
      .finally(() => {
        if (alive) setLoadingCats(false);
      });
    return () => {
      alive = false;
    };
  }, [allCategories.length]);

  // Filter categories by the picked event type so e.g. Stand Up doesn't show
  // for Cumătrie/Botez (audience: family with kids).
  const visible = categories
    .filter((c) => isCategoryAllowedForEvent(c.slug, data.eventType))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  function toggleService(id: string) {
    const current = data.services;
    const updated = current.includes(id)
      ? current.filter((s) => s !== id)
      : [...current, id];
    update({ services: updated });
  }

  return (
    <div>
      <WizardStepHeading
        step={5}
        title={t("wizard.services.title")}
        accent={t("wizard.services.accent")}
        description={t("wizard.services.desc")}
      />

      <div className="mb-5 ml-auto flex max-w-sm items-center gap-3 rounded-xl border border-[#e6b84d]/25 bg-[#0a101b]/68 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e6b84d]/55 text-[#e6b84d]">
          <ServiceIcon slug="sparkles" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold text-[#e8be56]">{t("wizard.services.multiHint")}</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-white/50">
            {t("wizard.services.multiHintSub")}
          </p>
        </div>
      </div>

      {loadingCats ? (
        // Skeleton tiles in the real grid shape, so the step does not jump
        // when the list arrives.
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-border/40 bg-muted/40"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("wizard.services.none")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((cat) => {
            const checked = data.services.includes(cat.slug);
            return (
              <button
                key={cat.slug}
                onClick={() => toggleService(cat.slug)}
                className={cn(
                  "relative flex min-h-16 items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all",
                  checked
                    ? "border-[#e6b84d] bg-[linear-gradient(100deg,rgba(230,184,77,.13),rgba(230,184,77,.04))] text-white shadow-[0_6px_22px_rgba(230,184,77,.08)]"
                    : "border-white/17 bg-[#0a101a]/55 text-white/78 hover:border-[#e6b84d]/45",
                )}
              >
                <ServiceIcon slug={cat.slug} className="h-7 w-7 text-[#e6b84d]" />
                <span className="text-xs font-medium leading-tight">
                  {getLocalized(cat, "name", locale)}
                </span>
                {checked && (
                  <span className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f2d278,#d9a63c)] text-[#07101d]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Budget step removed — events no longer track a target budget; the
// dashboard now exposes a per-category price filter instead.

// ─────────────────────────────────────────────────
// StepExtras — opt-in toggles for Checklist / Invitați / Așezare Mese.
// The seating toggle only renders when the guests toggle is on (asking
// the user how to seat 0 guests is meaningless).
// ─────────────────────────────────────────────────
function ExtraToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          "rounded-lg px-4 py-2 text-sm font-medium transition-all",
          on
            ? "bg-gold text-[#0D0D0D] shadow"
            : "bg-muted/40 text-muted-foreground hover:bg-muted",
        )}
      >
        <Check className="mr-1 inline h-3.5 w-3.5" /> {t("common.yes")}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          "rounded-lg px-4 py-2 text-sm font-medium transition-all",
          !on
            ? "bg-destructive/15 text-destructive ring-1 ring-destructive/30"
            : "bg-muted/40 text-muted-foreground hover:bg-muted",
        )}
      >
        {t("common.no")}
      </button>
    </div>
  );
}

function StepExtras({ data, update }: StepProps) {
  const { t } = useLocale();
  const options: Array<{
    key: "checklistEnabled" | "guestsEnabled" | "momentsEnabled";
    icon: typeof ClipboardList;
    title: string;
    desc: string;
  }> = [
    {
      key: "checklistEnabled",
      icon: ClipboardList,
      title: t("wizard.extras.checklistTitle"),
      desc: t("wizard.extras.checklistDesc"),
    },
    {
      key: "guestsEnabled",
      icon: Users,
      title: t("wizard.extras.guestsTitle"),
      desc: t("wizard.extras.guestsDesc"),
    },
    {
      key: "momentsEnabled",
      icon: Camera,
      title: t("wizard.extras.momentsTitle"),
      desc: t("wizard.extras.momentsDesc"),
    },
  ];

  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">
        {t("wizard.extras.title")}
      </h2>
      <p className="mb-8 text-muted-foreground">
        {t("wizard.extras.desc")}
      </p>

      <div className="space-y-3">
        {options.map((opt) => {
          const enabled = data[opt.key];
          return (
            <div
              key={opt.key}
              className={cn(
                "flex items-center gap-4 rounded-xl border p-4 transition-all",
                enabled
                  ? "border-gold/40 bg-gold/5"
                  : "border-border/40 hover:border-border",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  enabled ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground",
                )}
              >
                <opt.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold">{opt.title}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
              <ExtraToggle
                on={enabled}
                onChange={(v) => {
                  // Turning off guests must also turn off seating —
                  // seating without a guest list is meaningless.
                  if (opt.key === "guestsEnabled" && !v) {
                    update({ guestsEnabled: false, seatingEnabled: false });
                  } else {
                    update({ [opt.key]: v } as Partial<WizardData>);
                  }
                }}
              />
            </div>
          );
        })}

        {/* Seating toggle — only rendered when guests are enabled. */}
        {data.guestsEnabled && (
          <div
            className={cn(
              "flex items-center gap-4 rounded-xl border p-4 transition-all",
              data.seatingEnabled
                ? "border-gold/40 bg-gold/5"
                : "border-border/40 hover:border-border",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                data.seatingEnabled
                  ? "bg-gold/15 text-gold"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold">{t("wizard.extras.seatingTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("wizard.extras.seatingDesc")}
              </p>
            </div>
            <ExtraToggle
              on={data.seatingEnabled}
              onChange={(v) => update({ seatingEnabled: v })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface SummaryProps extends StepProps {
  isSignedIn: boolean;
}

function StepSummary({ data, update, isSignedIn, allCategories }: SummaryProps & { allCategories: CategoryRow[] }) {
  const { locale, t } = useLocale();
  // Real labels ("Iluzioniști / Magicieni") rather than raw slugs. This was a
  // second copy of the same /api/categories request the services step had
  // already made.
  const categoryNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of allCategories) map[c.slug] = getLocalized(c, "name", locale);
    return map;
  }, [allCategories, locale]);
  return (
    <div>
      <h2 className="mb-2 font-heading text-2xl font-bold">{t("wizard.step_summary")}</h2>
      <p className="mb-8 text-muted-foreground">
        {t("wizard.summary.desc")}
      </p>

      {/* Summary */}
      <div className="mb-8 space-y-3 rounded-xl border border-border/40 bg-card p-6">
        <SummaryRow label={t("wizard.steps.eventType")} value={t(`event_types.${data.eventType}`)} />
        <SummaryRow label={t("wizard.summary.date")} value={data.eventDate} />
        <SummaryRow label={t("wizard.summary.location")} value={data.location} />
        {/* The exact interval the user picked. This row used to print
            data.timeSlot, a three-bucket approximation of the start hour,
            so a 14:00–00:00 event came back as "după-amiază". */}
        {data.startTime && (
          <SummaryRow
            label={t("wizard.summary.interval")}
            value={
              computeEndTime(data.startTime, data.durationHours)
                ? `${data.startTime} – ${computeEndTime(data.startTime, data.durationHours)} (${data.durationHours}h)`
                : data.startTime
            }
          />
        )}
        <SummaryRow label={t("wizard.step_guests")} value={String(data.guestCount)} />
        {data.venueNeeded && (
          <SummaryRow
            label={t("wizard.step_venue")}
            value={
              data.venueNeeded === "yes"
                ? t("wizard.summary.venueYes")
                : t("wizard.summary.venueNo")
            }
          />
        )}
        {/* The radius was asked for on step 3 and then never shown again. */}
        {data.venueNeeded === "yes" && data.venueRadiusKm != null && (
          <SummaryRow
            label={t("wizard.venue.radiusLabel")}
            value={
              data.venueRadiusKm === 0
                ? t("wizard.summary.radiusCityOnly", { city: data.location })
                : data.venueRadiusKm >= 999
                  ? t("wizard.summary.radiusAll", { city: data.location })
                  : t("wizard.summary.radiusKm", {
                      city: data.location,
                      km: data.venueRadiusKm,
                    })
            }
          />
        )}
        {data.services.length > 0 && (
          <SummaryRow
            label={t("wizard.summary.categories")}
            value={data.services.map((s) => categoryNames[s] || s).join(", ")}
          />
        )}
      </div>

      {/* Login banner — only for visitors who haven't created an account
          yet. Authenticated users have already supplied their phone/email
          at signup, so we don't ask again. */}
      {!isSignedIn && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <LogIn className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div>
            <p className="text-sm font-semibold">{t("wizard.summary.authTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("wizard.summary.authDesc")}
            </p>
          </div>
        </div>
      )}

      {/* Event title — the only contact-style field we still ask for,
          because it becomes the plan title. The placeholder adapts to
          the chosen event type so the owner has a concrete suggestion;
          we never pre-fill the value, so the suggestion stays a hint
          (clicking the field shows an empty input, not text to delete). */}
      <div className="space-y-4">
        <div>
          <Label>{t("wizard.summary.nameLabel")} *</Label>
          <Input
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={t(eventNamePlaceholderKey(data.eventType))}
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("wizard.summary.nameHint")}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Suggest an event-style placeholder based on the picked type. The user can
 *  always override; this just nudges them away from typing their own name
 *  ("Stratulat Nicolae") into a field that's meant to title the event. */
function eventNamePlaceholderKey(eventType: string): string {
  switch (eventType) {
    case "cununie":
      return "wizard.namePlaceholder.cununie";
    case "proposal":
      return "wizard.namePlaceholder.proposal";
    case "baptism":
      return "wizard.namePlaceholder.baptism";
    case "cumatrie":
      return "wizard.namePlaceholder.cumatrie";
    case "corporate":
      return "wizard.namePlaceholder.corporate";
    case "birthday":
      return "wizard.namePlaceholder.birthday";
    case "kids_birthday":
      return "wizard.namePlaceholder.kidsBirthday";
    case "concert":
      return "wizard.namePlaceholder.concert";
    case "wedding":
    default:
      return "wizard.namePlaceholder.wedding";
  }
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
