/**
 * /admin/statistici — supply, demand, revenue and platform commission in one
 * filtered view.
 *
 * A server component on purpose: the numbers are read straight from the DB
 * behind the admin layout's requireAdmin() guard, so there is no /api/admin
 * surface to secure separately, and the filter state lives in the URL so a
 * view can be bookmarked or shared.
 */

import { redirect } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  CircleDollarSign,
  Inbox,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getAdminStats,
  getArtistCategories,
  type DateBasis,
  type StatsFilter,
  type VendorFilter,
} from "@/lib/db/queries/admin-stats";
import { eventTypeLabel, type EventTypeKey } from "@/lib/events/normalize";
import { formatAmount } from "@/lib/format/price";
import { t } from "@/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import {
  BarSeriesChart,
  ChartCard,
  ChartStyles,
  RankedBars,
  SERIES,
  TimeSeriesChart,
} from "@/components/admin/charts";
import { StatsFilters } from "./filters";
import { VendorTable } from "./vendor-table";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  return {
    title: t("admin.stats.metaTitle", isLocale(raw) ? raw : DEFAULT_LOCALE),
  };
}

/** Human labels for the booking_request_status enum. */
const STATUS_KEYS: Record<string, string> = {
  pending: "admin.stats.status.pending",
  accepted: "admin.stats.status.accepted",
  confirmed_by_client: "admin.stats.status.confirmedByClient",
  rejected: "admin.stats.status.rejected",
  cancelled: "admin.stats.status.cancelled",
  completed: "admin.stats.status.completed",
  expired: "admin.stats.status.expired",
};

const ROLE_KEYS: Record<string, string> = {
  user: "admin.stats.role.user",
  artist: "admin.stats.role.artist",
  editor: "admin.stats.role.editor",
  admin: "admin.stats.role.admin",
  super_admin: "admin.stats.role.superAdmin",
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * A real calendar date, not just the right shape. "2026-13-45" matches a
 * naive regex, then becomes an Invalid Date and takes the whole page down
 * with it — the filter comes from the URL, so that is one paste away.
 */
function validDate(v: string | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function parseFilter(sp: Record<string, string | string[] | undefined>): StatsFilter {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const from = one("from");
  const to = one("to");
  const vendor = one("vendor");
  const categoryId = Number(one("categorie"));
  const basis = one("dupa");

  return {
    from: validDate(from) ? from : isoDaysAgo(365),
    to: validDate(to) ? to : new Date().toISOString().slice(0, 10),
    vendor: vendor === "artist" || vendor === "venue" ? (vendor as VendorFilter) : "all",
    // int4 — a larger number is not a category id, it is an error waiting to
    // happen inside Postgres.
    categoryId:
      Number.isInteger(categoryId) && categoryId > 0 && categoryId <= 2_147_483_647
        ? categoryId
        : null,
    basis: basis === "event" ? ("event" as DateBasis) : ("created" as DateBasis),
  };
}

function monthLabel(iso: string, granularity: "day" | "month"): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return granularity === "month"
    ? d.toLocaleDateString("ro-RO", { month: "short", year: "2-digit", timeZone: "UTC" })
    : d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${accent ? "text-gold" : ""}`} />
        {label}
      </div>
      <p
        className={`mt-2 font-heading text-2xl font-bold tabular-nums ${accent ? "text-gold" : "text-foreground"}`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function StatisticiPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const admin = await requireAdmin();
  if (!admin.ok) redirect(admin.status === 401 ? "/sign-in?redirect_url=/admin/statistici" : "/");

  const filter = parseFilter(await searchParams);
  const [stats, categories] = await Promise.all([
    getAdminStats(filter),
    getArtistCategories(),
  ]);

  const series = stats.series.map((b) => ({
    date: b.date,
    label: monthLabel(b.date, stats.granularity),
    values: [b.requests, b.orders],
  }));
  const gmvSeries = stats.series.map((b) => ({
    date: b.date,
    label: monthLabel(b.date, stats.granularity),
    value: b.gmv,
  }));

  const basisNote =
    filter.basis === "event"
      ? t("admin.stats.basisEvent", locale)
      : t("admin.stats.basisCreated", locale);

  return (
    <div className="space-y-5">
      <ChartStyles />

      <header className="space-y-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {t("admin.stats.title", locale)}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("admin.stats.subtitle", locale, { basis: basisNote })}
            {filter.categoryId != null &&
              ` ${t("admin.stats.categoryNote", locale)}`}
          </p>
        </div>
        <StatsFilters value={filter} categories={categories} />
      </header>

      {/* Supply — the catalogue as it stands today, not date-filtered. */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("admin.stats.catalog", locale)}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={Users}
            label={t("admin.stats.usersRegistered", locale)}
            value={String(stats.supply.usersTotal)}
            hint={t("admin.stats.usersNewHint", locale, {
              count: stats.supply.usersNew,
            })}
          />
          <Kpi
            icon={Users}
            label={t("admin.stats.artists", locale)}
            value={String(stats.supply.artistsTotal)}
            hint={t("admin.stats.artistsActiveHint", locale, {
              count: stats.supply.artistsActive,
            })}
          />
          <Kpi
            icon={Building2}
            label={t("admin.stats.venues", locale)}
            value={String(stats.supply.venuesTotal)}
            hint={t("admin.stats.venuesActiveHint", locale, {
              count: stats.supply.venuesActive,
            })}
          />
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {t("admin.stats.byRole", locale)}
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {stats.supply.usersByRole
                .sort((a, b) => b.count - a.count)
                .map((r) => (
                  <li key={r.role} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {ROLE_KEYS[r.role] ? t(ROLE_KEYS[r.role], locale) : r.role}
                    </span>
                    <b className="tabular-nums">{r.count}</b>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Demand + money */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("admin.stats.demandRevenue", locale)}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={Inbox}
            label={t("admin.stats.requests", locale)}
            value={String(stats.demand.requests)}
            hint={t("admin.stats.requestsSplitHint", locale, {
              artists: stats.demand.requestsArtist,
              venues: stats.demand.requestsVenue,
            })}
          />
          <Kpi
            icon={CalendarCheck}
            label={t("admin.stats.ordersConfirmed", locale)}
            value={String(stats.demand.orders)}
            hint={t("admin.stats.conversionHint", locale, {
              pct: stats.demand.conversionPct.toFixed(1),
            })}
          />
          <Kpi
            icon={TrendingUp}
            label={t("admin.stats.vendorRevenue", locale)}
            value={formatAmount(stats.demand.gmv)}
            hint={t("admin.stats.vendorRevenueHint", locale)}
          />
          <Kpi
            icon={CircleDollarSign}
            label={t("admin.stats.platformRevenue", locale)}
            value={formatAmount(stats.platform.billed)}
            hint={t("admin.stats.collectedHint", locale, {
              amount: formatAmount(stats.platform.collected),
            })}
            accent
          />
        </div>
      </section>

      {stats.platform.outstanding > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
          <Wallet className="h-4 w-4 text-warning" />
          <span>
            {t("admin.stats.toCollect", locale)}{" "}
            <b>{formatAmount(stats.platform.outstanding)}</b>
            {stats.platform.overdue > 0 && (
              <>
                {" "}· {t("admin.stats.overdue", locale)}{" "}
                <b className="text-destructive">{formatAmount(stats.platform.overdue)}</b>
              </>
            )}
          </span>
          <a href="/admin/finante" className="ml-auto text-gold hover:underline">
            {t("admin.stats.openFinance", locale)}
          </a>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="xl:col-span-2">
          <ChartCard
            title={t("admin.stats.requestsOrders", locale)}
            subtitle={
              stats.granularity === "month"
                ? t("admin.stats.perMonth", locale)
                : t("admin.stats.perDay", locale)
            }
            legend={[
              { label: t("admin.stats.requests", locale), color: SERIES[0] },
              { label: t("admin.stats.ordersConfirmed", locale), color: SERIES[1] },
            ]}
          >
            <TimeSeriesChart
              points={series}
              seriesLabels={[
                t("admin.stats.requests", locale),
                t("admin.stats.ordersConfirmed", locale),
              ]}
              emptyText={t("admin.stats.emptyRequests", locale)}
            />
          </ChartCard>
        </div>

        <div className="xl:col-span-2">
          <ChartCard
            title={t("admin.stats.vendorRevenue", locale)}
            subtitle={t("admin.stats.vendorRevenueChartHint", locale)}
          >
            <BarSeriesChart
              points={gmvSeries}
              emptyText={t("admin.stats.emptyOrders", locale)}
              formatValue={(n) => formatAmount(n)}
            />
          </ChartCard>
        </div>

        <ChartCard
          title={t("admin.stats.byStatus", locale)}
          subtitle={t("admin.stats.byStatusHint", locale)}
        >
          <RankedBars
            rows={stats.byStatus
              .sort((a, b) => b.count - a.count)
              .map((s) => ({
                key: s.status,
                label: STATUS_KEYS[s.status]
                  ? t(STATUS_KEYS[s.status], locale)
                  : s.status,
                value: s.count,
              }))}
            emptyText={t("admin.stats.nothingToShow", locale)}
          />
        </ChartCard>

        <ChartCard
          title={t("admin.stats.byEventType", locale)}
          subtitle={t("admin.stats.byEventTypeHint", locale)}
        >
          <RankedBars
            rows={stats.byEventType.map((e) => ({
              key: e.key,
              label: eventTypeLabel(
                e.key === "unknown" ? null : (e.key as EventTypeKey),
              ),
              value: e.count,
              note: e.gmv > 0 ? formatAmount(e.gmv) : undefined,
            }))}
            emptyText={t("admin.stats.nothingToShow", locale)}
          />
        </ChartCard>

        <div className="xl:col-span-2">
          <ChartCard
            title={t("admin.stats.byCategory", locale)}
            subtitle={t("admin.stats.byCategoryHint", locale)}
          >
            <RankedBars
              rows={stats.byCategory.map((c) => ({
                key: c.key,
                label: c.label,
                value: c.count,
              }))}
              emptyText={t("admin.stats.emptyCategory", locale)}
            />
          </ChartCard>
        </div>
      </div>

      <VendorTable rows={stats.vendors} />

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <b>{t("admin.stats.note.heading", locale)}</b>{" "}
        {t("admin.stats.note.p1Pre", locale)}{" "}
        <i>{t("admin.stats.note.p1Term", locale)}</i>{" "}
        {t("admin.stats.note.p1Post", locale)}{" "}
        {t("admin.stats.note.p2Pre", locale)}{" "}
        <i>{t("admin.stats.note.p2Term", locale)}</i>{" "}
        {t("admin.stats.note.p2Post", locale)}{" "}
        <i>{t("admin.stats.note.p3Term", locale)}</i>{" "}
        {t("admin.stats.note.p3Post", locale)}{" "}
        <i>{t("admin.stats.note.p4Term", locale)}</i>{" "}
        {t("admin.stats.note.p4Post", locale)}
      </p>
    </div>
  );
}
