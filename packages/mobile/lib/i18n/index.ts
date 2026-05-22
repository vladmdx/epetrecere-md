// i18n bootstrap.
//
// Strategy:
//   - i18next is the engine (huge ecosystem, easy to add namespaces).
//   - react-i18next gives us the React Native-friendly `useTranslation`
//     hook.
//   - Device locale is the default; we persist user overrides via
//     SecureStore (so a Romanian phone that the user wants in English
//     stays in English between launches).
//   - Resources are imported eagerly here. They're small (a few KB
//     gzipped per language) and shipping them with the JS bundle is
//     faster than lazy-loading them at first render.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";

import ro from "./locales/ro";
import ru from "./locales/ru";
import en from "./locales/en";

const STORAGE_KEY = "epetrecere.locale.v1";
const SUPPORTED = ["ro", "ru", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED)[number];

function detectInitialLocale(): SupportedLocale {
  // 1. User override from SecureStore (read synchronously elsewhere
  //    on first launch — we don't await here because i18next setup is
  //    synchronous. The override is applied via setLocale() once the
  //    app is mounted; until then the device default is fine.)
  // 2. Device locale (first matching SUPPORTED).
  const locales = getLocales();
  for (const l of locales) {
    const code = (l.languageCode ?? "").toLowerCase();
    if (SUPPORTED.includes(code as SupportedLocale)) {
      return code as SupportedLocale;
    }
  }
  return "ro"; // Moldovan market default.
}

void i18n.use(initReactI18next).init({
  resources: {
    ro: { translation: ro },
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: detectInitialLocale(),
  fallbackLng: "ro",
  interpolation: { escapeValue: false }, // RN handles XSS at render time
  returnNull: false,
  compatibilityJSON: "v4",
});

/** Read the persisted user-override locale and apply it. Call this
 *  from RootLayout effect; safe to call before i18n is fully ready. */
export async function applyPersistedLocale(): Promise<void> {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored as SupportedLocale)) {
      await i18n.changeLanguage(stored);
    }
  } catch {
    // No-op — fall back to detected locale.
  }
}

/** Set + persist the locale. Use this from a language picker. */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, locale);
  } catch {
    // No-op — locale change still applies in memory.
  }
}

export const supportedLocales = SUPPORTED;
export default i18n;
