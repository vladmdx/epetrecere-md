"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Music, Building2, PartyPopper, Phone } from "lucide-react";

/**
 * If the user just came through the public /planifica wizard, their answers
 * are sitting in sessionStorage. POST them to /api/event-plans/from-wizard
 * so the dashboard opens with the plan already populated, then redirect
 * into that plan. Returns `null` if no wizard data (or on failure) so the
 * caller falls back to the default routing.
 */
async function consumeWizardData(): Promise<string | null> {
  try {
    const raw = sessionStorage.getItem("wizard-data");
    if (!raw) return null;
    const wizard = JSON.parse(raw);
    // Only treat wizard data as a real submission if it has at least one
    // meaningful field filled in. Browsing /planifica without filling
    // anything used to populate sessionStorage with empty defaults, which
    // then silently bypassed the role picker after signup.
    const hasContent =
      (wizard.eventType && wizard.eventType !== "") ||
      (wizard.eventDate && wizard.eventDate !== "") ||
      (Array.isArray(wizard.services) && wizard.services.length > 0) ||
      (typeof wizard.guestCount === "number" && wizard.guestCount > 0) ||
      (typeof wizard.budget === "number" && wizard.budget > 0);
    if (!hasContent) {
      sessionStorage.removeItem("wizard-data");
      return null;
    }
    const res = await fetch("/api/event-plans/from-wizard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wizard),
    });
    if (!res.ok) return null;
    const data = await res.json();
    sessionStorage.removeItem("wizard-data");
    return data?.plan?.id ? `/cabinet/planifica/${data.plan.id}?tab=bookings` : null;
  } catch {
    return null;
  }
}

type RoleChoice = "client" | "artist" | "venue" | null;

export default function AuthRedirectPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [showPhoneStep, setShowPhoneStep] = useState(false);
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleChoice>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }

    /** Public tool landing pages (e.g. /utilitati/budget) stash the desired
     *  /cabinet path in sessionStorage before bouncing through sign-in.
     *  Consume it here so the user lands inside the tool, not on /cabinet. */
    function consumeIntendedNext(): string | null {
      try {
        const raw = sessionStorage.getItem("next-url");
        if (!raw) return null;
        sessionStorage.removeItem("next-url");
        // Only allow same-origin /cabinet paths to avoid open-redirect.
        if (raw.startsWith("/cabinet/") || raw.startsWith("/dashboard/")) {
          return raw;
        }
        return null;
      } catch {
        return null;
      }
    }

    async function checkRole() {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) {
          // No email yet — show role picker directly (safest default for new users)
          setShowRoleSelect(true);
          setChecking(false);
          return;
        }

        const res = await fetch(`/api/auth/check-role?email=${encodeURIComponent(email)}`);
        if (!res.ok) {
          setShowRoleSelect(true);
          setChecking(false);
          return;
        }
        const data = await res.json();

        if (data.role === "admin" || data.role === "super_admin") {
          router.replace("/admin");
        } else if (data.role === "artist") {
          if (data.onboardingComplete) {
            router.replace("/dashboard");
          } else {
            router.replace("/dashboard/onboarding");
          }
        } else if (data.isNewUser === true) {
          // New user — collect phone first if missing, then role picker.
          // NOTE: We do NOT bypass via wizard-data anymore. Stale wizard data
          // (from someone who browsed /planifica without submitting) used to
          // skip the role picker and silently mark them as client. Wizard
          // consumption now happens only after they explicitly pick "client".
          // Pre-fill from Clerk phoneNumbers if available
          const clerkPhone = user?.phoneNumbers?.[0]?.phoneNumber || "";
          if (data.phone && data.phone.length >= 6) {
            // Phone already in DB — skip to role picker
            setShowRoleSelect(true);
          } else if (clerkPhone) {
            // Phone in Clerk but not yet synced — save it then show picker
            await fetch("/api/auth/set-phone", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phone: clerkPhone }),
            }).catch(() => {});
            setShowRoleSelect(true);
          } else {
            // Need to collect — show phone step first
            setShowPhoneStep(true);
          }
          setChecking(false);
        } else if (data.hasVenue) {
          // Vendor — honor explicit /dashboard/* deep-link if set.
          const intended = consumeIntendedNext();
          router.replace(intended && intended.startsWith("/dashboard/") ? intended : "/dashboard");
        } else {
          // Existing client — priority order:
          //   1. Explicit /cabinet/* deep-link (from a public tool landing)
          //   2. Wizard data → take them into the new plan
          //   3. Default /cabinet
          const intended = consumeIntendedNext();
          if (intended && intended.startsWith("/cabinet/")) {
            router.replace(intended);
            return;
          }
          const planUrl = await consumeWizardData();
          router.replace(planUrl ?? "/cabinet");
        }
      } catch {
        // On error, show role picker as safe fallback
        setShowRoleSelect(true);
        setChecking(false);
      }
    }

    checkRole();
  }, [isLoaded, isSignedIn, user, router]);

  async function handlePhoneSubmit() {
    const trimmed = phoneInput.trim();
    if (trimmed.length < 6) {
      setPhoneError("Numărul de telefon e prea scurt");
      return;
    }
    setPhoneError(null);
    setSavingPhone(true);
    try {
      const res = await fetch("/api/auth/set-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      if (!res.ok) {
        setPhoneError("Nu s-a putut salva numărul. Încearcă din nou.");
        return;
      }
      // Move on to role picker
      setShowPhoneStep(false);
      setShowRoleSelect(true);
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleRoleSelect() {
    if (!selectedRole) return;
    setSubmitting(true);

    // Persist the chosen role IMMEDIATELY so the user is treated as
    // artist/venue from the next request — not only after onboarding
    // finishes. Falls through to the legacy redirect on failure.
    await fetch("/api/auth/select-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: selectedRole }),
    }).catch(() => {});

    if (selectedRole === "client") {
      // Same priority as in checkRole — explicit deep-link wins over wizard.
      try {
        const raw = sessionStorage.getItem("next-url");
        if (raw && raw.startsWith("/cabinet/")) {
          sessionStorage.removeItem("next-url");
          router.replace(raw);
          return;
        }
      } catch {
        /* ignore — fall through to wizard / default */
      }
      const planUrl = await consumeWizardData();
      router.replace(planUrl ?? "/cabinet");
    } else if (selectedRole === "artist") {
      router.replace("/dashboard/onboarding");
    } else if (selectedRole === "venue") {
      router.replace("/dashboard/venue-onboarding");
    }
  }

  if (checking && !showRoleSelect && !showPhoneStep) {
    return (
      <div className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-[#0D0D0D]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#C9A84C]" />
          <p className="text-sm text-[#B0B0C0]">Se verifică contul...</p>
        </div>
      </div>
    );
  }

  if (showPhoneStep) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0D0D] px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A84C]/10">
              <Phone className="h-7 w-7 text-[#C9A84C]" />
            </div>
            <h1 className="text-2xl font-bold text-[#FAF8F2] font-heading md:text-3xl">
              Bine ai venit pe ePetrecere!
            </h1>
            <p className="mt-2 text-[#B0B0C0]">
              Adaugă numărul tău de telefon pentru a finaliza înregistrarea.
            </p>
          </div>

          <div className="rounded-xl border border-[#2A2A3E] bg-[#1A1A2E] p-5">
            <label className="text-sm font-medium text-[#FAF8F2]">
              Număr de telefon *
            </label>
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => {
                setPhoneInput(e.target.value);
                if (phoneError) setPhoneError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePhoneSubmit();
              }}
              placeholder="+373 69 ..."
              className="mt-2 w-full rounded-lg border border-[#2A2A3E] bg-[#141428] px-4 py-3 text-[#FAF8F2] placeholder:text-[#666] focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C]"
              autoFocus
            />
            {phoneError && (
              <p className="mt-2 text-xs text-red-400">{phoneError}</p>
            )}
            <p className="mt-2 text-xs text-[#B0B0C0]">
              Folosit pentru a primi confirmări de rezervare. Nu este vizibil
              public — doar tu și administratorii îl pot vedea.
            </p>
          </div>

          <button
            onClick={handlePhoneSubmit}
            disabled={savingPhone || phoneInput.trim().length < 6}
            className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold transition-all ${
              phoneInput.trim().length >= 6 && !savingPhone
                ? "bg-[#C9A84C] text-[#0D0D0D] hover:bg-[#A08839] shadow-lg"
                : "bg-[#2A2A3E] text-[#666] cursor-not-allowed"
            }`}
          >
            {savingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continuă
          </button>
        </div>
      </div>
    );
  }

  if (showRoleSelect) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0D0D] px-4">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-[#FAF8F2] font-heading md:text-3xl">
              Bine ai venit pe ePetrecere!
            </h1>
            <p className="mt-2 text-[#B0B0C0]">
              Cum dorești să folosești platforma?
            </p>
          </div>

          <div className="space-y-3">
            {/* Client */}
            <button
              onClick={() => setSelectedRole("client")}
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-5 text-left transition-all ${
                selectedRole === "client"
                  ? "border-[#C9A84C] bg-[#C9A84C]/10 shadow-[0_0_20px_rgba(201,168,76,0.15)]"
                  : "border-[#2A2A3E] bg-[#1A1A2E] hover:border-[#C9A84C]/40"
              }`}
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                selectedRole === "client" ? "bg-[#C9A84C]/20 text-[#C9A84C]" : "bg-[#141428] text-[#B0B0C0]"
              }`}>
                <PartyPopper className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-[#FAF8F2]">Client</p>
                <p className="text-sm text-[#B0B0C0]">
                  Caut artiști și săli pentru evenimentul meu
                </p>
              </div>
            </button>

            {/* Artist */}
            <button
              onClick={() => setSelectedRole("artist")}
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-5 text-left transition-all ${
                selectedRole === "artist"
                  ? "border-[#C9A84C] bg-[#C9A84C]/10 shadow-[0_0_20px_rgba(201,168,76,0.15)]"
                  : "border-[#2A2A3E] bg-[#1A1A2E] hover:border-[#C9A84C]/40"
              }`}
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                selectedRole === "artist" ? "bg-[#C9A84C]/20 text-[#C9A84C]" : "bg-[#141428] text-[#B0B0C0]"
              }`}>
                <Music className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-[#FAF8F2]">Partener (Artist / Formație)</p>
                <p className="text-sm text-[#B0B0C0]">
                  Vreau să-mi promovez serviciile și să primesc rezervări
                </p>
              </div>
            </button>

            {/* Venue */}
            <button
              onClick={() => setSelectedRole("venue")}
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-5 text-left transition-all ${
                selectedRole === "venue"
                  ? "border-[#C9A84C] bg-[#C9A84C]/10 shadow-[0_0_20px_rgba(201,168,76,0.15)]"
                  : "border-[#2A2A3E] bg-[#1A1A2E] hover:border-[#C9A84C]/40"
              }`}
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                selectedRole === "venue" ? "bg-[#C9A84C]/20 text-[#C9A84C]" : "bg-[#141428] text-[#B0B0C0]"
              }`}>
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-[#FAF8F2]">Sală de evenimente</p>
                <p className="text-sm text-[#B0B0C0]">
                  Vreau să-mi listez sala și să primesc rezervări
                </p>
              </div>
            </button>
          </div>

          <button
            onClick={handleRoleSelect}
            disabled={!selectedRole || submitting}
            className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold transition-all ${
              selectedRole
                ? "bg-[#C9A84C] text-[#0D0D0D] hover:bg-[#A08839] shadow-lg"
                : "bg-[#2A2A3E] text-[#666] cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Continuă
          </button>
        </div>
      </div>
    );
  }

  return null;
}
