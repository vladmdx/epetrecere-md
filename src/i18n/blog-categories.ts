import type { Locale } from "@/types";

const categories: Record<string, Record<Locale, string>> = {
  "buget și planificare": {
    ro: "Buget și planificare",
    ru: "Бюджет и планирование",
    en: "Budget and planning",
  },
  "ghiduri de nuntă": {
    ro: "Ghiduri de nuntă",
    ru: "Свадебные гиды",
    en: "Wedding guides",
  },
  "săli și locații": {
    ro: "Săli și locații",
    ru: "Залы и локации",
    en: "Venues and locations",
  },
};

export function localizeBlogCategory(
  category: string | null | undefined,
  locale: Locale,
): string | null {
  if (!category) return null;
  return categories[category.toLocaleLowerCase("ro-RO")]?.[locale] ?? category;
}
