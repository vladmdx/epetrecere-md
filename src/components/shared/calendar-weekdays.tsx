import React from "react";
import { t } from "@/i18n";
import type { AppLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Already-localized abbreviations must not be reinterpreted as Romanian
 * words by the legacy translator (English "Tu" previously became "You"). */
export function CalendarWeekdays({ locale, className, dayClassName }: {
  locale: AppLocale;
  className?: string;
  dayClassName?: string;
}) {
  return (
    <div data-no-auto-translate translate="no" lang={locale} className={cn("grid grid-cols-7 text-center", className)}>
      {WEEKDAYS.map((day) => (
        <div key={day} className={dayClassName} aria-label={t(`date.weekday.${day}`, locale)} title={t(`date.weekday.${day}`, locale)}>
          {t(`date.weekdayShort.${day}`, locale)}
        </div>
      ))}
    </div>
  );
}
