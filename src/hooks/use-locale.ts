"use client";

import { useState, useEffect, useCallback } from "react";
import type { Locale } from "@/types";
import { defaultLocale, t as translate } from "@/i18n";

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale;
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith("locale="));
  return (cookie?.split("=")[1] as Locale) || defaultLocale;
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    setLocaleState(getStoredLocale());
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    document.cookie = `locale=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(key, locale, vars),
    [locale],
  );

  return { locale, setLocale, t };
}
