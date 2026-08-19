/**
 * Plural forms for RO / RU / EN.
 *
 * The QA audit found broken agreement all over the site — "1 artists found",
 * "1 артиcтов найдено", "1 recenzii", "1 fotografii", "3 часы программы" —
 * because counts were interpolated into a single hardcoded plural string.
 * These are the real rules:
 *
 *   RO — 1 → singular; 2–19 → plural; ≥20 (and 0) → plural with "de"
 *        (1 furnizor, 5 furnizori, 20 de furnizori)
 *   RU — three forms by the last digit/teen rule
 *        (1 артист, 2 артиста, 5 артистов)
 *   EN — 1 → singular, everything else plural
 */

export type PluralLocale = "ro" | "ru" | "en";

export interface RoForms {
  one: string;
  few: string;
  /** Used for ≥20 and 0 — Romanian inserts "de" before the noun. */
  many?: string;
}

export interface RuForms {
  one: string;
  few: string;
  many: string;
}

export interface EnForms {
  one: string;
  other: string;
}

/** Romanian: 1 / 2–19 / ≥20 (the last takes "de"). */
export function pluralRo(n: number, f: RoForms): string {
  const abs = Math.abs(n);
  if (abs === 1) return `${n} ${f.one}`;
  const mod100 = abs % 100;
  const needsDe = abs === 0 || mod100 === 0 || mod100 >= 20;
  return needsDe ? `${n} de ${f.many ?? f.few}` : `${n} ${f.few}`;
}

/** Russian: 1 / 2–4 / 5–20 + the teens exception. */
export function pluralRu(n: number, f: RuForms): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} ${f.many}`;
  if (last === 1) return `${n} ${f.one}`;
  if (last >= 2 && last <= 4) return `${n} ${f.few}`;
  return `${n} ${f.many}`;
}

export function pluralEn(n: number, f: EnForms): string {
  return `${n} ${Math.abs(n) === 1 ? f.one : f.other}`;
}

export interface AllForms {
  ro: RoForms;
  ru: RuForms;
  en: EnForms;
}

export function plural(n: number, locale: string, forms: AllForms): string {
  switch (locale) {
    case "ru":
      return pluralRu(n, forms.ru);
    case "en":
      return pluralEn(n, forms.en);
    default:
      return pluralRo(n, forms.ro);
  }
}

/** Shared nouns used in more than one place. */
export const NOUNS = {
  suppliers: {
    ro: { one: "furnizor", few: "furnizori", many: "furnizori" },
    ru: { one: "поставщик", few: "поставщика", many: "поставщиков" },
    en: { one: "vendor", other: "vendors" },
  },
  artists: {
    ro: { one: "artist", few: "artiști", many: "artiști" },
    ru: { one: "артист", few: "артиста", many: "артистов" },
    en: { one: "artist", other: "artists" },
  },
  venues: {
    ro: { one: "locație", few: "locații", many: "locații" },
    ru: { one: "локация", few: "локации", many: "локаций" },
    en: { one: "venue", other: "venues" },
  },
  reviews: {
    ro: { one: "recenzie", few: "recenzii", many: "recenzii" },
    ru: { one: "отзыв", few: "отзыва", many: "отзывов" },
    en: { one: "review", other: "reviews" },
  },
  photos: {
    ro: { one: "fotografie", few: "fotografii", many: "fotografii" },
    ru: { one: "фотография", few: "фотографии", many: "фотографий" },
    en: { one: "photo", other: "photos" },
  },
  guests: {
    ro: { one: "invitat", few: "invitați", many: "invitați" },
    ru: { one: "гость", few: "гостя", many: "гостей" },
    en: { one: "guest", other: "guests" },
  },
} satisfies Record<string, AllForms>;
