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

/** Normalized lowercase set for membership checks (case-insensitive). */
const CITY_SET = new Set(MOLDOVA_CITIES.map((c) => c.toLowerCase()));

export function isKnownCity(city: string | null | undefined): boolean {
  if (!city) return false;
  return CITY_SET.has(city.toLowerCase());
}

// Distance options for "max travel km" picker. 30 = base city + suburbs,
// then 20km steps to 160, then "all Moldova" (sentinel = 999).
export const TRAVEL_DISTANCE_OPTIONS = [
  { value: 30, label: "Doar Chișinău + suburbii" },
  { value: 50, label: "50 km" },
  { value: 70, label: "70 km" },
  { value: 90, label: "90 km" },
  { value: 110, label: "110 km" },
  { value: 130, label: "130 km" },
  { value: 150, label: "150 km" },
  { value: 999, label: "Toată Moldova" },
];

export const DEFAULT_TRAVEL_KM = 30;

/** Buffer (minutes) options between bookings — partner setting. */
export const BUFFER_MINUTES_OPTIONS = [15, 30, 45, 60, 75, 90];

export const DEFAULT_BUFFER_MINUTES = 15;
