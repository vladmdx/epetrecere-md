// M2 — SEO auto-pages whitelisted Moldovan cities.
// Slugs are ASCII, lowercase, hyphen-free so they drop straight into URLs.
// The `keywords` list is used for SQL ILIKE matching against the free-form
// `artists.location` and `venues.city` text fields (users type things like
// "Chișinău", "Chisinau", "mun. Chișinău" — we match any).

export type CityDef = {
  slug: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  /** SQL ILIKE patterns used to match user-entered locations. */
  keywords: string[];
  /** Approximate population — used for sitemap priority ordering. */
  priority: number;
};

export const CITIES: CityDef[] = [
  {
    slug: "chisinau",
    nameRo: "Chișinău",
    nameRu: "Кишинёв",
    nameEn: "Chișinău",
    keywords: ["chișinău", "chisinau", "кишинёв", "кишинев"],
    priority: 1.0,
  },
  {
    slug: "balti",
    nameRo: "Bălți",
    nameRu: "Бельцы",
    nameEn: "Bălți",
    keywords: ["bălți", "balti", "бельцы"],
    priority: 0.9,
  },
  {
    slug: "tiraspol",
    nameRo: "Tiraspol",
    nameRu: "Тирасполь",
    nameEn: "Tiraspol",
    keywords: ["tiraspol", "тирасполь"],
    priority: 0.85,
  },
  {
    slug: "cahul",
    nameRo: "Cahul",
    nameRu: "Кагул",
    nameEn: "Cahul",
    keywords: ["cahul", "кагул"],
    priority: 0.8,
  },
  {
    slug: "ungheni",
    nameRo: "Ungheni",
    nameRu: "Унгены",
    nameEn: "Ungheni",
    keywords: ["ungheni", "унгены"],
    priority: 0.8,
  },
  {
    slug: "orhei",
    nameRo: "Orhei",
    nameRu: "Оргеев",
    nameEn: "Orhei",
    keywords: ["orhei", "оргеев"],
    priority: 0.8,
  },
  {
    slug: "comrat",
    nameRo: "Comrat",
    nameRu: "Комрат",
    nameEn: "Comrat",
    keywords: ["comrat", "комрат"],
    priority: 0.8,
  },
  {
    slug: "soroca",
    nameRo: "Soroca",
    nameRu: "Сорока",
    nameEn: "Soroca",
    keywords: ["soroca", "сорока"],
    priority: 0.75,
  },
  {
    slug: "hincesti",
    nameRo: "Hîncești",
    nameRu: "Хынчешты",
    nameEn: "Hîncești",
    keywords: ["hîncești", "hincesti", "хынчешты"],
    priority: 0.7,
  },
  {
    slug: "straseni",
    nameRo: "Strășeni",
    nameRu: "Страшены",
    nameEn: "Strășeni",
    keywords: ["strășeni", "straseni", "страшены"],
    priority: 0.7,
  },
  {
    slug: "ialoveni",
    nameRo: "Ialoveni",
    nameRu: "Яловены",
    nameEn: "Ialoveni",
    keywords: ["ialoveni", "яловены"],
    priority: 0.7,
  },
];

export function getCityBySlug(slug: string): CityDef | null {
  return CITIES.find((c) => c.slug === slug) ?? null;
}

export function getCityLocalizedName(
  city: CityDef,
  locale: "ro" | "ru" | "en",
): string {
  if (locale === "ru") return city.nameRu;
  if (locale === "en") return city.nameEn;
  return city.nameRo;
}
