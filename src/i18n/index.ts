import type { Locale } from "@/types";
import ro from "./ro.json";
import ru from "./ru.json";
import en from "./en.json";

const translations: Record<Locale, Record<string, unknown>> = { ro, ru, en };

export const defaultLocale: Locale = "ro";
export const locales: Locale[] = ["ro", "ru", "en"];

export const localeNames: Record<Locale, string> = {
  ro: "Română",
  ru: "Русский",
  en: "English",
};

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : path;
}

export function t(key: string, locale: Locale = defaultLocale, vars?: Record<string, string | number>): string {
  let text = getNestedValue(translations[locale] ?? translations[defaultLocale], key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

/** Get a localized field from a multilingual entity.
 * Supports both snake_case (name_ro) and camelCase (nameRo) field patterns. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLocalized(
  entity: Record<string, any>,
  field: string,
  locale: Locale = defaultLocale,
): string {
  const capLocale = locale.charAt(0).toUpperCase() + locale.slice(1);

  // Try camelCase first (nameRo), then snake_case (name_ro)
  const value = entity[`${field}${capLocale}`] ?? entity[`${field}_${locale}`];
  if (typeof value === "string" && value) return value;

  // Fallback chain: ro → ru → en (both formats)
  const fallback =
    entity[`${field}Ro`] ?? entity[`${field}_ro`] ??
    entity[`${field}Ru`] ?? entity[`${field}_ru`] ??
    entity[`${field}En`] ?? entity[`${field}_en`];
  return typeof fallback === "string" ? fallback : "";
}
