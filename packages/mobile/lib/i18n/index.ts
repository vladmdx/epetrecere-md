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
  // Moldova-first: default to Romanian. We only auto-adopt the device
  // language when the phone's primary locale is Russian (the other local
  // language). An English (or any other) device still starts in Romanian —
  // English is the least likely real preference for this market and users
  // can switch any time via the language picker (persisted in SecureStore,
  // applied by applyPersistedLocale() on launch).
  const primary = (getLocales()[0]?.languageCode ?? "").toLowerCase();
  if (primary === "ru") return "ru";
  return "ro";
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
  // v3, not v4: the v4 plural resolver requires `Intl.PluralRules`, which the
  // Hermes runtime doesn't ship — that mismatch is what prints the noisy
  // "i18next::pluralResolver: Your environment seems not to be Intl API
  // compatible" LogBox warning on every launch. v3 uses i18next's built-in
  // plural rules (no Intl needed). We use ZERO plural keys (no `_one`/`_other`
  // suffixes, no `t(key, { count })`), so this is purely a warning-silencing
  // change with no effect on rendered strings. If CLDR plurals are ever needed,
  // add the `@formatjs/intl-pluralrules` polyfill and switch back to v4.
  compatibilityJSON: "v3",
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
