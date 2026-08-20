"use client";

import { useMemo } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, roRO, ruRU } from "@clerk/localizations";
import { useLocale } from "@/hooks/use-locale";
import {
  CLERK_RO_OVERRIDES,
  CLERK_RU_OVERRIDES,
  mergeLocalization,
} from "@/lib/i18n/clerk-overrides";

export function LocalizedClerkProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();

  // Clerk's shipped bundles leave some strings in English — the sign-up
  // password placeholder among them. Patch them per language.
  const localization = useMemo(() => {
    if (locale === "en") return enUS;
    if (locale === "ru") return mergeLocalization(ruRU, CLERK_RU_OVERRIDES);
    return mergeLocalization(roRO, CLERK_RO_OVERRIDES);
  }, [locale]);

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInForceRedirectUrl="/auth-redirect"
      signUpForceRedirectUrl="/auth-redirect"
      signInFallbackRedirectUrl="/auth-redirect"
      signUpFallbackRedirectUrl="/auth-redirect"
      localization={localization}
    >
      {children}
    </ClerkProvider>
  );
}
