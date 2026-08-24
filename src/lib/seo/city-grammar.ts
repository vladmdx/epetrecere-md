/**
 * City names in the form a sentence actually needs.
 *
 * `cities.ts` stores the nominative ("Кишинёв"), but Russian declines a city
 * after "в" — "артисты в Кишинёв" is the kind of sentence that tells a reader
 * the page was machine-translated. RO and EN take the plain name, so only
 * Russian needs a table.
 */

import type { Locale } from "@/types";
import { getCityLocalizedName, type CityDef } from "./cities";

/** Prepositional ("предложный") form for every whitelisted city. */
const RU_PREPOSITIONAL: Record<string, string> = {
  chisinau: "Кишинёве",
  balti: "Бельцах",
  tiraspol: "Тирасполе",
  cahul: "Кагуле",
  ungheni: "Унгенах",
  orhei: "Оргееве",
  comrat: "Комрате",
  soroca: "Сороке",
  hincesti: "Хынчештах",
  straseni: "Страшенах",
  ialoveni: "Яловенах",
};

/**
 * City name as it should read after "în" / "в" / "in".
 * A city added to the whitelist without a table entry falls back to the
 * nominative — slightly off in Russian, but never empty.
 */
export function cityNameAfterIn(city: CityDef, locale: Locale): string {
  if (locale === "ru") return RU_PREPOSITIONAL[city.slug] ?? city.nameRu;
  return getCityLocalizedName(city, locale);
}
