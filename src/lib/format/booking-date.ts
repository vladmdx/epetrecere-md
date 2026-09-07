import type { AppLocale } from "@/lib/i18n/routing";

const languageTags: Record<AppLocale, string> = { ro: "ro-MD", ru: "ru-MD", en: "en-GB" };

/** A SQL date is a calendar day, not a UTC instant that may move to the
 * previous day in another timezone. Timestamps retain normal Intl behavior. */
export function formatBookingDate(value: string | null | undefined, locale: AppLocale,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string {
  if (!value) return "-";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime()) || (dateOnly && date.toISOString().slice(0, 10) !== value)) return "-";
  return new Intl.DateTimeFormat(languageTags[locale], {
    ...options, ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(date);
}
