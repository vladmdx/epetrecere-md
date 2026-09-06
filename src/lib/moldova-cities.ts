// Static list of Moldovan localities used in pickers across the app
// (planifica wizard, artist setari, venue setari, partner registration).
// Order: Chișinău first, then top-5 cities by population, then the rest
// alphabetically. Anything missing → falls back to free text.

import type { Locale } from "@/types";

const TOP_CITIES = [
  "Chișinău",
  "Bălți",
  "Tiraspol",
  "Tighina (Bender)",
  "Cahul",
  "Ungheni",
];

const ALPHABETIC = [
  "Anenii Noi",
  "Basarabeasca",
  "Briceni",
  "Călărași",
  "Cantemir",
  "Căușeni",
  "Cimișlia",
  "Comrat",
  "Criuleni",
  "Dnestrovsc",
  "Dondușeni",
  "Drochia",
  "Dubăsari",
  "Edineț",
  "Fălești",
  "Florești",
  "Glodeni",
  "Hîncești",
  "Ialoveni",
  "Leova",
  "Nisporeni",
  "Ocnița",
  "Orhei",
  "Otaci",
  "Rezina",
  "Rîbnița",
  "Rîșcani",
  "Sîngerei",
  "Slobozia",
  "Soroca",
  "Strășeni",
  "Șoldănești",
  "Ștefan Vodă",
  "Taraclia",
  "Telenești",
  "Vulcănești",
];

/** All localities, in display order (top first, then alphabetical). */
export const MOLDOVA_CITIES: string[] = [...TOP_CITIES, ...ALPHABETIC];

export const DEFAULT_CITY = "Chișinău";

const CITY_NAMES_RU: Record<string, string> = {
  "Chișinău": "Кишинёв",
  "Bălți": "Бельцы",
  Tiraspol: "Тирасполь",
  "Tighina (Bender)": "Бендеры",
  Cahul: "Кагул",
  Ungheni: "Унгены",
  "Anenii Noi": "Новые Анены",
  Basarabeasca: "Бессарабка",
  Briceni: "Бричаны",
  "Călărași": "Калараш",
  Cantemir: "Кантемир",
  "Căușeni": "Каушаны",
  "Cimișlia": "Чимишлия",
  Comrat: "Комрат",
  Criuleni: "Криуляны",
  Dnestrovsc: "Днестровск",
  "Dondușeni": "Дондюшаны",
  Drochia: "Дрокия",
  "Dubăsari": "Дубоссары",
  "Edineț": "Единцы",
  "Fălești": "Фалешты",
  "Florești": "Флорешты",
  Glodeni: "Глодяны",
  "Hîncești": "Хынчешты",
  Ialoveni: "Яловены",
  Leova: "Леова",
  Nisporeni: "Ниспорены",
  "Ocnița": "Окница",
  Orhei: "Оргеев",
  Otaci: "Отачь",
  Rezina: "Резина",
  "Rîbnița": "Рыбница",
  "Rîșcani": "Рышканы",
  "Sîngerei": "Сынжерей",
  Slobozia: "Слободзея",
  Soroca: "Сороки",
  "Strășeni": "Страшены",
  "Șoldănești": "Шолданешты",
  "Ștefan Vodă": "Штефан-Водэ",
  Taraclia: "Тараклия",
  "Telenești": "Теленешты",
  "Vulcănești": "Вулканешты",
};

export function localizeMoldovaCity(city: string, locale: Locale): string {
  return locale === "ru" ? CITY_NAMES_RU[city] ?? city : city;
}

function normalizeCitySpelling(city: string): string {
  return city.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const CITY_BY_SPELLING = new Map<string, string>();
for (const city of MOLDOVA_CITIES) {
  CITY_BY_SPELLING.set(normalizeCitySpelling(city), city);
  const russian = CITY_NAMES_RU[city];
  if (russian) CITY_BY_SPELLING.set(normalizeCitySpelling(russian), city);
}
const CITY_ALIASES: Record<string, string> = {
  "Hâncești": "Hîncești",
  "Sângerei": "Sîngerei",
  "Râșcani": "Rîșcani",
  "Râbnița": "Rîbnița",
  "Bender": "Tighina (Bender)",
  "Tighina": "Tighina (Bender)",
};
for (const [alias, city] of Object.entries(CITY_ALIASES)) {
  CITY_BY_SPELLING.set(normalizeCitySpelling(alias), city);
}

/** Store one canonical city value regardless of the interface language. */
export function canonicalMoldovaCity(city: string): string | undefined {
  return CITY_BY_SPELLING.get(normalizeCitySpelling(city));
}

/** Known local spellings, including Russian, for legacy city records. */
export function moldovaCitySpellings(city: string): string[] {
  const canonical = canonicalMoldovaCity(city) ?? city.trim();
  return Array.from(new Set([
    canonical,
    ...(CITY_NAMES_RU[canonical] ? [CITY_NAMES_RU[canonical]] : []),
    ...Object.keys(CITY_ALIASES).filter((alias) => CITY_ALIASES[alias] === canonical),
    ...Array.from(CITY_BY_SPELLING.entries())
      .filter(([, value]) => value === canonical)
      .map(([spelling]) => spelling),
  ]));
}

export function isKnownCity(city: string | null | undefined): boolean {
  if (!city) return false;
  return Boolean(canonicalMoldovaCity(city));
}

// Distance options for "max travel km" picker. 30 = base city + suburbs,
// then 20km steps to 150, then "all Moldova" (sentinel = 999).
export const TRAVEL_DISTANCE_VALUES = [30, 50, 70, 90, 110, 130, 150, 999] as const;

export function travelDistanceLabel(distanceKm: number, baseCity: string, locale: Locale): string {
  const city = localizeMoldovaCity(canonicalMoldovaCity(baseCity) ?? baseCity, locale);
  if (distanceKm >= 999) {
    return { ro: "Toată Moldova", ru: "Вся Молдова", en: "All of Moldova" }[locale];
  }
  if (distanceKm === 30) {
    return {
      ro: `${city} și împrejurimi (30 km)`,
      ru: `${city} и окрестности (30 км)`,
      en: `${city} and nearby areas (30 km)`,
    }[locale];
  }
  return {
    ro: `Până la ${distanceKm} km de ${city}`,
    ru: `До ${distanceKm} км от ${city}`,
    en: `Up to ${distanceKm} km from ${city}`,
  }[locale];
}

export function getTravelDistanceOptions(baseCity: string, locale: Locale) {
  return TRAVEL_DISTANCE_VALUES.map((value) => ({
    value,
    label: travelDistanceLabel(value, baseCity, locale),
  }));
}

export const DEFAULT_TRAVEL_KM = 30;

/** Buffer (minutes) options between bookings — partner setting. */
export const BUFFER_MINUTES_OPTIONS = [15, 30, 45, 60, 75, 90];

export const DEFAULT_BUFFER_MINUTES = 15;
