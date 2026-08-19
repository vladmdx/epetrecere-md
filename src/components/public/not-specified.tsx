"use client";

/**
 * Marker for a comparison cell the vendor never filled in.
 *
 * A bare "—" left users guessing whether the feature was missing or simply
 * unstated (flagged in the QA audit). This says so in words, and carries a
 * title/aria-label so screen readers announce it rather than reading a dash.
 */

import { useLocale } from "@/hooks/use-locale";

export function NotSpecified() {
  const { t } = useLocale();
  const label = t("common.notSpecified");
  return (
    <span className="text-xs italic text-muted-foreground/70" title={label} aria-label={label}>
      {label}
    </span>
  );
}
