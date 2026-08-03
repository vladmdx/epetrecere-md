"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { enUS, roRO, ruRU } from "@clerk/localizations";
import { useLocale } from "@/hooks/use-locale";

export function LocalizedClerkProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const localization = locale === "ru" ? ruRU : locale === "en" ? enUS : roRO;

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
