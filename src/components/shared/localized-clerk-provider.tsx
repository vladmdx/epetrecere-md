"use client";

import { useMemo } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, roRO, ruRU } from "@clerk/localizations";
import { useLocale } from "@/hooks/use-locale";
import { localizePath } from "@/lib/i18n/routing";
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

  // Clerk copies these paths verbatim into its own footer links and into
  // every post-auth redirect. Left unprefixed, the "register" link on
  // /ru/sign-in lands on the Romanian /sign-up and the language is gone —
  // and so does the account that has just been created.
  const p = (path: string) => localizePath(path, locale);

  return (
    <ClerkProvider
      signInUrl={p("/sign-in")}
      signUpUrl={p("/sign-up")}
      signInForceRedirectUrl={p("/auth-redirect")}
      signUpForceRedirectUrl={p("/auth-redirect")}
      signInFallbackRedirectUrl={p("/auth-redirect")}
      signUpFallbackRedirectUrl={p("/auth-redirect")}
      localization={localization}
    >
      {children}
    </ClerkProvider>
  );
}
