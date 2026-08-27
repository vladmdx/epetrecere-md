/**
 * One vocabulary for event types.
 *
 * `booking_requests.event_type` is unconstrained text and three different
 * parts of the product write into it: the public form and the wizard write
 * English keys (wedding, baptism, cumatrie…), the vendor calendar writes
 * Romanian slugs (nunta, botez, cumetrie…), and some rows carry a display
 * label typed by a human ("Nuntă"). Production already holds all three, so a
 * report that groups by the raw column splits one real category across
 * several rows.
 *
 * Everything funnels through `normalizeEventType` before it is counted.
 */

import { ALL_EVENT_TYPES, type EventTypeKey } from "@/lib/wizard/categories-meta";

export type { EventTypeKey };
export { ALL_EVENT_TYPES };

/** lowercase, strip diacritics, collapse separators. */
function key(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[\s\-/]+/g, "_");
}

const ALIASES: Record<string, EventTypeKey> = {
  // wedding — the party
  wedding: "wedding",
  nunta: "wedding",
  nunti: "wedding",
  svadba: "wedding",
  // proposal — the moment before everything else
  proposal: "proposal",
  cerere: "proposal",
  cerere_in_casatorie: "proposal",
  cerere_casatorie: "proposal",
  marry_me: "proposal",
  predlozhenie: "proposal",
  // cununie — the ceremony, often organised as its own event here
  cununie: "cununie",
  cununia: "cununie",
  cununie_civila: "cununie",
  cununie_religioasa: "cununie",
  ceremony: "cununie",
  venchanie: "cununie",
  // baptism
  baptism: "baptism",
  botez: "baptism",
  christening: "baptism",
  // cumătrie — the Romanian spelling is split in the wild (cumatrie/cumetrie)
  cumatrie: "cumatrie",
  cumetrie: "cumatrie",
  // corporate
  corporate: "corporate",
  corporativ: "corporate",
  corporate_event: "corporate",
  // birthdays and anniversaries
  birthday: "birthday",
  zi_nastere: "birthday",
  zi_de_nastere: "birthday",
  aniversare: "birthday",
  anniversary: "birthday",
  // a children's party is a different job from an adult one
  kids_birthday: "kids_birthday",
  aniversare_copii: "kids_birthday",
  zi_nastere_copii: "kids_birthday",
  petrecere_copii: "kids_birthday",
  kids: "kids_birthday",
  // concert
  concert: "concert",
  // everything else
  other: "other",
  altele: "other",
  revelion: "other",
  graduation: "other",
  absolvire: "other",
};

/** Returns null for an empty or unrecognised value, so callers can bucket it. */
export function normalizeEventType(
  raw: string | null | undefined,
): EventTypeKey | null {
  if (!raw) return null;
  return ALIASES[key(raw)] ?? null;
}

const LABELS: Record<EventTypeKey, { ro: string; ru: string; en: string }> = {
  wedding: { ro: "Nuntă", ru: "Свадьба", en: "Wedding" },
  proposal: {
    ro: "Cerere în căsătorie",
    ru: "Предложение руки и сердца",
    en: "Marriage proposal",
  },
  cununie: { ro: "Cununie", ru: "Венчание", en: "Wedding ceremony" },
  baptism: { ro: "Botez", ru: "Крестины", en: "Baptism" },
  cumatrie: { ro: "Cumătrie", ru: "Кумэтрия", en: "Cumătrie" },
  corporate: { ro: "Corporate", ru: "Корпоратив", en: "Corporate" },
  birthday: { ro: "Zi de naștere", ru: "День рождения", en: "Birthday" },
  kids_birthday: {
    ro: "Aniversare copii",
    ru: "Детский день рождения",
    en: "Kids birthday",
  },
  concert: { ro: "Concert", ru: "Концерт", en: "Concert" },
  other: { ro: "Altele", ru: "Другое", en: "Other" },
};

/**
 * One emoji per event type, so the pickers that use emoji rather than icons
 * (the quiz tiles, the booking form, the calendar widget) all show the same
 * mark for the same event. They each used to keep their own list, which is
 * how the quiz ended up offering "Cumătrie" under the value `baptism`.
 */
export const EVENT_TYPE_EMOJI: Record<EventTypeKey, string> = {
  wedding: "💍",
  proposal: "💐",
  cununie: "⛪",
  baptism: "👶",
  cumatrie: "🤝",
  birthday: "🎂",
  kids_birthday: "🎈",
  corporate: "💼",
  concert: "🎵",
  other: "🎉",
};

export function eventTypeLabel(k: EventTypeKey | null, locale = "ro"): string {
  if (!k) {
    return locale === "ru"
      ? "Не указано"
      : locale === "en"
        ? "Unspecified"
        : "Nespecificat";
  }
  const row = LABELS[k];
  return locale === "ru" ? row.ru : locale === "en" ? row.en : row.ro;
}
