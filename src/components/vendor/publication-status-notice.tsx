import React from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { t } from "@/i18n";
import type { AppLocale } from "@/lib/i18n/routing";

/** Publication is driven by the owner-scoped database flag, not by profile
 * completion or account role. Inactive also covers profiles later unpublished
 * by an admin, so do not claim every inactive record is awaiting its first review. */
export function PublicationStatusNotice({ isActive, locale }: { isActive: boolean; locale: AppLocale }) {
  const state = isActive === true ? "published" : "unpublished";
  const Icon = isActive === true ? CheckCircle2 : Clock;

  return (
    <section
      role="status"
      data-publication-state={state}
      className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-4"
    >
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{t(`vendor.publication.${state}Title`, locale)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(`vendor.publication.${state}Description`, locale)}</p>
      </div>
    </section>
  );
}
