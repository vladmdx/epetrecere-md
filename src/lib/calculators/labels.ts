/**
 * Translate a calculator data-table label.
 *
 * The norm tables in `@/lib/calculators` carry Romanian labels (they double as
 * stable identifiers). The QA audit found those tables rendered untranslated
 * inside the Russian and English calculators. Rather than duplicating every
 * table per locale, the Romanian label is used as the i18n key: values live
 * under `calcLabels.<label>` and fall back to the label itself, so a new row
 * shows Romanian rather than a missing-key path.
 */

import { t as translate } from "@/i18n";
import type { Locale } from "@/types";

export function calcLabel(label: string, locale: Locale | string): string {
  const key = `calcLabels.${label}`;
  const out = translate(key, locale as Locale);
  return out === key ? label : out;
}
