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

export const metadata = { title: "Statistici — Admin" };

/** Human labels for the booking_request_status enum. */
const STATUS_LABELS: Record<string, string> = {
  pending: "În așteptare",
  accepted: "Acceptate",
  confirmed_by_client: "Confirmate",
  rejected: "Refuzate",
  cancelled: "Anulate",
  completed: "Finalizate",
  expired: "Expirate",
};

const ROLE_LABELS: Record<string, string> = {
  user: "Clienți",
  artist: "Artiști",
  editor: "Editori",
  admin: "Administratori",
  super_admin: "Super admin",
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return d.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    from: from && DATE_RE.test(from) ? from : isoDaysAgo(365),
    to: to && DATE_RE.test(to) ? to : new Date().toISOString().slice(0, 10),
    vendor: vendor === "artist" || vendor === "venue" ? (vendor as VendorFilter) : "all",
    categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null,
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
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
      ? "încadrate după data evenimentului"
      : "încadrate după data cererii";

  return (
    <div className="space-y-5">
      <ChartStyles />

      <header className="space-y-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Statistici</h1>
          <p className="text-xs text-muted-foreground">
            Cerere, venituri și comisionul platformei — {basisNote}.
            {filter.categoryId != null &&
              " Filtrul pe categorie se aplică doar artiștilor; sălile nu au categorii."}
          </p>
        </div>
        <StatsFilters value={filter} categories={categories} />
      </header>

      {/* Supply — the catalogue as it stands today, not date-filtered. */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Catalog
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={Users}
            label="Utilizatori înregistrați"
            value={String(stats.supply.usersTotal)}
            hint={`${stats.supply.usersNew} noi în perioadă`}
          />
          <Kpi
            icon={Users}
            label="Artiști"
            value={String(stats.supply.artistsTotal)}
            hint={`${stats.supply.artistsActive} activi`}
          />
          <Kpi
            icon={Building2}
            label="Săli"
            value={String(stats.supply.venuesTotal)}
            hint={`${stats.supply.venuesActive} active`}
          />
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Pe rol
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {stats.supply.usersByRole
                .sort((a, b) => b.count - a.count)
                .map((r) => (
                  <li key={r.role} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {ROLE_LABELS[r.role] ?? r.role}
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
          Cerere și venituri
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={Inbox}
            label="Solicitări"
            value={String(stats.demand.requests)}
            hint={`${stats.demand.requestsArtist} artiști · ${stats.demand.requestsVenue} săli`}
          />
          <Kpi
            icon={CalendarCheck}
            label="Comenzi confirmate"
            value={String(stats.demand.orders)}
            hint={`conversie ${stats.demand.conversionPct.toFixed(1)}%`}
          />
          <Kpi
            icon={TrendingUp}
            label="Venit furnizori"
            value={formatAmount(stats.demand.gmv)}
            hint="suma prețurilor agreate pe comenzi"
          />
          <Kpi
            icon={CircleDollarSign}
            label="Venit platformă"
            value={formatAmount(stats.platform.billed)}
            hint={`${formatAmount(stats.platform.collected)} încasat`}
            accent
          />
        </div>
      </section>

      {stats.platform.outstanding > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
          <Wallet className="h-4 w-4 text-warning" />
          <span>
            De încasat: <b>{formatAmount(stats.platform.outstanding)}</b>
            {stats.platform.overdue > 0 && (
              <>
                {" "}· restant: <b className="text-destructive">{formatAmount(stats.platform.overdue)}</b>
              </>
            )}
          </span>
          <a href="/admin/finante" className="ml-auto text-gold hover:underline">
            Deschide Finanțe →
          </a>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="xl:col-span-2">
          <ChartCard
            title="Solicitări și comenzi"
            subtitle={stats.granularity === "month" ? "pe lună" : "pe zi"}
            legend={[
              { label: "Solicitări", color: SERIES[0] },
              { label: "Comenzi confirmate", color: SERIES[1] },
            ]}
          >
            <TimeSeriesChart
              points={series}
              seriesLabels={["Solicitări", "Comenzi confirmate"]}
              emptyText="Nicio solicitare în perioada selectată."
            />
          </ChartCard>
        </div>

        <div className="xl:col-span-2">
          <ChartCard
            title="Venit furnizori"
            subtitle="suma prețurilor agreate pe comenzile confirmate"
          >
            <BarSeriesChart
              points={gmvSeries}
              emptyText="Nicio comandă cu preț agreat în perioada selectată."
              formatValue={(n) => formatAmount(n)}
            />
          </ChartCard>
        </div>

        <ChartCard title="Pe status" subtitle="toate solicitările din perioadă">
          <RankedBars
            rows={stats.byStatus
              .sort((a, b) => b.count - a.count)
              .map((s) => ({
                key: s.status,
                label: STATUS_LABELS[s.status] ?? s.status,
                value: s.count,
              }))}
            emptyText="Nimic de arătat."
          />
        </ChartCard>

        <ChartCard title="Pe tip de eveniment" subtitle="ortografiile sunt unificate">
          <RankedBars
            rows={stats.byEventType.map((e) => ({
              key: e.key,
              label: eventTypeLabel(
                e.key === "unknown" ? null : (e.key as EventTypeKey),
              ),
              value: e.count,
              note: e.gmv > 0 ? formatAmount(e.gmv) : undefined,
            }))}
            emptyText="Nimic de arătat."
          />
        </ChartCard>

        <div className="xl:col-span-2">
          <ChartCard
            title="Pe categorie"
            subtitle="doar artiști — un artist poate fi în mai multe categorii, deci totalul depășește numărul de solicitări"
          >
            <RankedBars
              rows={stats.byCategory.map((c) => ({
                key: c.key,
                label: c.label,
                value: c.count,
                note: c.gmv > 0 ? formatAmount(c.gmv) : undefined,
              }))}
              emptyText="Nicio solicitare către un artist cu categorie setată."
            />
          </ChartCard>
        </div>
      </div>

      <VendorTable rows={stats.vendors} />

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <b>Cum se numără.</b> O <i>solicitare</i> este orice cerere de rezervare
        primită de un furnizor. O <i>comandă</i> este o rezervare ajunsă la
        „confirmată de client" sau „finalizată" — exact stările care generează
        comision. <i>Venitul furnizorului</i> este suma prețurilor agreate pe
        comenzi; rezervările fără preț agreat contribuie cu 0, nu cu prețul de
        listă. <i>Venitul platformei</i> vine din registrul de comisioane: 5% de
        la artiști, tarif fix pe tranșe de invitați la săli. Blocările manuale
        din calendarul furnizorilor nu sunt tranzacții și sunt excluse peste tot.
      </p>
    </div>
  );
}
