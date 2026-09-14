import React from "react";
import { t } from "@/i18n";
import { eventTypeLabel, normalizeEventType } from "@/lib/events/normalize";
import type { AppLocale } from "@/lib/i18n/routing";
import type { VenueLegacySummary, VenueRecentBooking } from "@/lib/db/queries/venue-stats";

const COPY = {
  ro: {
    title: "Arhiva rezervărilor anterioare", total: "Înregistrări în arhivă", pending: "În așteptare în arhivă",
    confirmed: "Confirmate, luna curentă", current: "Sume agreate, luna curentă", previous: "Sume agreate, luna precedentă",
    note: "Aceste înregistrări provin din sistemul anterior și sunt doar pentru consultare. Sunt raportate separat de cererile actuale, deoarece nu există o legătură sigură pentru identificarea dublurilor.",
    latest: "Ultimele înregistrări din arhivă", unknown: "Client necunoscut",
  },
  ru: {
    title: "Архив прежних бронирований", total: "Записей в архиве", pending: "Ожидают в архиве",
    confirmed: "Подтверждены в текущем месяце", current: "Согласованные суммы, текущий месяц", previous: "Согласованные суммы, прошлый месяц",
    note: "Эти записи из прежней системы доступны только для просмотра. Они показаны отдельно от текущих запросов, поскольку нет надёжной связи для определения дубликатов.",
    latest: "Последние записи архива", unknown: "Неизвестный клиент",
  },
  en: {
    title: "Previous booking archive", total: "Archived records", pending: "Pending in archive",
    confirmed: "Confirmed this month", current: "Agreed amounts, this month", previous: "Agreed amounts, last month",
    note: "These records come from the previous system and are read-only. They are reported separately from current requests because there is no reliable link for identifying duplicates.",
    latest: "Latest archived records", unknown: "Unknown client",
  },
} as const;

const STATUS_KEYS: Record<string, string> = {
  pending: "statusPending", accepted: "statusAccepted", confirmed: "statusConfirmed",
  declined: "statusDeclined", completed: "statusCompleted", cancelled: "statusCancelled",
};

/** Legacy IDs never enter booking-request links or action handlers. */
export function LegacyVenueHistory({ summary, rows, locale, canManageFinancials }: {
  summary: VenueLegacySummary;
  rows: VenueRecentBooking[];
  locale: AppLocale;
  canManageFinancials: boolean;
}) {
  if (summary.totalBookings === 0) return null;
  const copy = COPY[locale];
  const metrics: Array<[string, string | number]> = [
    [copy.total, summary.totalBookings],
    [copy.pending, summary.pendingBookings],
    [copy.confirmed, summary.confirmedThisMonth],
  ];
  if (canManageFinancials) {
    metrics.push(
      [copy.current, `${summary.revenueThisMonth} €`],
      [copy.previous, `${summary.revenueLastMonth} €`],
    );
  }
  return (
    <section data-legacy-venue-history data-no-auto-translate className="rounded-xl border border-border/40 bg-card p-5">
      <h2 className="font-heading text-base font-semibold">{copy.title}</h2>
      <p className="mt-2 text-xs text-muted-foreground">{copy.note}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
      </dl>
      {rows.length > 0 && <details className="mt-5">
        <summary className="cursor-pointer text-sm text-gold">{copy.latest}</summary>
        <ul className="mt-3 space-y-2">
          {rows.map((row) => <li key={`legacy-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/30 p-3 text-xs">
            <span className="min-w-0 break-words font-medium">{row.clientName || copy.unknown}</span>
            <span>{row.eventDate ? new Date(`${row.eventDate}T12:00:00Z`).toLocaleDateString(locale) : "-"}</span>
            <span>{eventTypeLabel(normalizeEventType(row.eventType), locale)}</span>
            <span>{t(`vendor.venueHome.${STATUS_KEYS[row.status] ?? "statusPending"}`, locale)}</span>
            {canManageFinancials && <span>
              {row.priceAgreed == null ? "-" : `${row.priceAgreed} €`}
            </span>}
          </li>)}
        </ul>
      </details>}
    </section>
  );
}
