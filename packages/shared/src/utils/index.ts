// Cross-platform helpers. No DOM, no React, no Node-only APIs — these
// run identically in the Next.js server, the browser, and React Native.

import type { EventType } from "../types";

// ─── Money formatting ───────────────────────────────────────────────

/** Format a whole-EUR amount Romanian-style: 24850 → "24.850 €".
 *  Returns just the number for small amounts to avoid awkward "0.024". */
export function formatMoneyEUR(eur: number): string {
  if (!Number.isFinite(eur)) return "0 €";
  if (eur < 1000) return `${eur} €`;
  const thousand = Math.floor(eur / 1000);
  const remainder = String(eur % 1000).padStart(3, "0");
  return `${thousand}.${remainder} €`;
}

/** Romanian-style integer (1234 → "1.234"). Helpful for guest counts,
 *  view counts, etc. that don't need a currency suffix. */
export function formatThousandsRO(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) < 1000) return String(n);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const thousand = Math.floor(abs / 1000);
  const rest = String(abs % 1000).padStart(3, "0");
  return `${sign}${thousand}.${rest}`;
}

// ─── Date formatting ────────────────────────────────────────────────

export const WEEKDAYS_RO = [
  "Duminică",
  "Luni",
  "Marți",
  "Miercuri",
  "Joi",
  "Vineri",
  "Sâmbătă",
] as const;

export const MONTHS_RO = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
] as const;

export const MONTHS_RO_SHORT = [
  "ian.",
  "feb.",
  "mar.",
  "apr.",
  "mai",
  "iun.",
  "iul.",
  "aug.",
  "sep.",
  "oct.",
  "noi.",
  "dec.",
] as const;

/** Parse YYYY-MM-DD into a local Date without timezone shift. */
export function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  // "T00:00:00" anchor avoids UTC-vs-local drift that turns "2026-05-22"
  // into "2026-05-21" in negative timezones.
  return new Date(iso.slice(0, 10) + "T00:00:00");
}

/** "22 mai 2026". */
export function formatDateRO(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS_RO[d.getMonth()]} ${d.getFullYear()}`;
}

/** "22 mai. 2026" — short month, used in list rows. */
export function formatDateShortRO(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS_RO_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sâmbătă, 22 mai 2026". */
export function formatWeekdayDateRO(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return "";
  return `${WEEKDAYS_RO[d.getDay()]}, ${formatDateRO(iso)}`;
}

/** "acum 5 min" / "acum 3h" / "ieri" / "12 mai" — Romanian-friendly
 *  relative time. Falls back to the absolute date past one week so we
 *  don't say "acum 47 zile" (looks like a bug). */
export function relativeTimeRO(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "acum";
  if (min < 60) return `acum ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `acum ${hr}h`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "ieri";
  if (day < 7) return `acum ${day} zile`;
  return formatDateShortRO(iso.slice(0, 10));
}

// ─── Localization helpers ───────────────────────────────────────────

export const EVENT_TYPE_LABELS_RO: Record<EventType, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  corporate: "Corporate",
  birthday: "Aniversare",
  concert: "Concert",
  other: "Eveniment",
};

export function eventTypeLabel(
  type: EventType | string | null | undefined,
): string {
  if (!type) return "Eveniment";
  return (EVENT_TYPE_LABELS_RO as Record<string, string>)[type] ?? "Eveniment";
}

// ─── Strings ────────────────────────────────────────────────────────

/** Strip diacritics + lowercase so "Cântăreți" matches "cantaret". */
export function normalizeDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Initials from a name (first letter of first two words). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Guards ─────────────────────────────────────────────────────────

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
