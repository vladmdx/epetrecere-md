"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function AuthRedirectPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }

    // Check user role from our DB
    async function checkRole() {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) {
          router.replace("/cabinet");
          return;
        }

        // Check if user exists in our artists table (by email match)
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
        } else {
          router.replace("/cabinet");
        }
      } catch {
        router.replace("/cabinet");
      }
    }

    checkRole();
  }, [isLoaded, isSignedIn, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
        <p className="text-sm text-muted-foreground">Se verifică contul...</p>
      </div>
    </div>
  );
}
