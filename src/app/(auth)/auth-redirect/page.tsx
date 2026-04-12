"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Music, Building2, PartyPopper } from "lucide-react";

type RoleChoice = "client" | "artist" | "venue" | null;

export default function AuthRedirectPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleChoice>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }

    async function checkRole() {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) {
          router.replace("/cabinet");
          return;
        }

        const res = await fetch(`/api/auth/check-role?email=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (data.role === "admin" || data.role === "super_admin") {
          router.replace("/admin");
        } else if (data.role === "artist") {
          if (data.onboardingComplete) {
            router.replace("/dashboard");
          } else {
            router.replace("/dashboard/onboarding");
          }
        } else if (data.isNewUser === true && !data.hasVenue) {
          // New user without a role — show role selection
          setShowRoleSelect(true);
          setChecking(false);
        } else if (data.hasVenue) {
          router.replace("/dashboard");
        } else {
          router.replace("/cabinet");
        }
      } catch {
        router.replace("/cabinet");
      }
    }

    checkRole();
  }, [isLoaded, isSignedIn, user, router]);

  async function handleRoleSelect() {
    if (!selectedRole) return;
    setSubmitting(true);

    if (selectedRole === "client") {
      router.replace("/cabinet");
    } else if (selectedRole === "artist") {
      router.replace("/dashboard/onboarding");
    } else if (selectedRole === "venue") {
      router.replace("/dashboard/venue-onboarding");
    }
  }

  if (checking && !showRoleSelect) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0D0D]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#C9A84C]" />
          <p className="text-sm text-[#B0B0C0]">Se verifică contul...</p>
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
                <p className="font-bold text-[#FAF8F2]">Artist / Formație</p>
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
