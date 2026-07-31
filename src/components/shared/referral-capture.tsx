"use client";

// Client component mounted on the root public layout that watches for a
// `?ref=xxx` param and fires one POST /api/referrals/capture call when a
// signed-in user lands with it.
//
// Stores a flag in localStorage so we don't hit the API on every page view.
// The capture endpoint is itself idempotent, but skipping the round-trip
// is still nicer.

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import {
  CONSENT_UPDATED_EVENT,
  hasPrivacyConsent,
} from "@/lib/privacy/consent";

const LS_KEY = "referral-captured";

export function ReferralCapture() {
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const capture = () => {
      if (!hasPrivacyConsent("marketing")) return;
      // Read ?ref= from current URL.
      const params = new URLSearchParams(window.location.search);
      const code = params.get("ref")?.trim().toLowerCase();
      if (!code) return;

      // Skip if we've already tried for this code.
      try {
        const captured = localStorage.getItem(LS_KEY);
        if (captured === code) return;
      } catch {
        // private mode: proceed without persistent attribution
      }

      void fetch("/api/referrals/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
        .then((r) => {
          if (r.ok) {
            try {
              localStorage.setItem(LS_KEY, code);
            } catch {
              /* noop */
            }
          }
        })
        .catch(() => {});
    };

    capture();
    window.addEventListener(CONSENT_UPDATED_EVENT, capture);
    return () => window.removeEventListener(CONSENT_UPDATED_EVENT, capture);
  }, [isLoaded, isSignedIn]);

  return null;
}
