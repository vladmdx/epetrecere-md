"use client";

import { useMemo, useState } from "react";
import {
  Wallet,
  TrendingUp,
  Percent,
  CheckCircle2,
  Clock,
  FileDown,
  Printer,
  Calendar as CalendarIcon,
  Search,
  Filter,
  ArrowUp,
  ArrowDown,
  Loader2,
  Circle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizeEventType, eventTypeLabel } from "@/lib/events/normalize";
import { useLocale } from "@/hooks/use-locale";

interface Booking {
  id: number;
  clientName: string;
  eventType: string | null;
  eventDate: string | null;
  agreedPrice: number | null;
  status: string;
  paidStatus: string | null;
  updatedAt: string;
  createdAt: string;
}

interface ChartPoint {
  month: string;
  label: string;
  total: number;
  count: number;
}

interface Props {
  venueName: string;
  stats: {
    revenueThisMonth: number;
    revenueTotal: number;
    commissionThisMonth: number;
    paid: number;
    unpaid: number;
    bookingsThisMonth: number;
  };
  bookings: Booking[];
  chartData: ChartPoint[];
  /** bookingId → fee actually raised. Absent means no fee is due yet. */
  commissionByBooking: Record<number, number>;
}

/** Color palette for the pie chart — one tone per event type. */
const EVENT_COLORS: Record<string, string> = {
  wedding: "#E74C3C",
  proposal: "#D946EF",
  nunta: "#E74C3C",
  cununie: "#EC7063",
  baptism: "#3498DB",
  botez: "#3498DB",
  cumatrie: "#06B6D4",
  corporate: "#9B59B6",
  birthday: "#F39C12",
  aniversare: "#F39C12",
  kids_birthday: "#F1C40F",
  other: "#64748B",
};

export function VenueFinanciarClient({
  venueName,
  stats,
  bookings: initialBookings,
  chartData,
  commissionByBooking,
}: Props) {
  const { t } = useLocale();
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [search, setSearch] = useState("");
  const [filterEventType, setFilterEventType] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortKey, setSortKey] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [togglingPaid, setTogglingPaid] = useState<number | null>(null);

  /** Distinct event types present in the dataset — for the filter dropdown. */
  const availableEventTypes = useMemo(() => {
    const types = new Set<string>();
    for (const b of bookings) {
      if (b.eventType) types.add(b.eventType.toLowerCase());
    }
    return Array.from(types);
  }, [bookings]);

  const filtered = useMemo(() => {
    let list = bookings;
    if (filter === "paid") list = list.filter((b) => b.paidStatus === "paid");
    else if (filter === "unpaid")
      list = list.filter((b) => b.paidStatus !== "paid");

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((b) =>
        [b.clientName, b.eventType, String(b.id)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    if (filterEventType !== "all") {
      list = list.filter(
        (b) => (b.eventType || "").toLowerCase() === filterEventType,
      );
    }
    if (filterDateFrom) {
      list = list.filter((b) => b.eventDate && b.eventDate >= filterDateFrom);
    }
    if (filterDateTo) {
      list = list.filter((b) => b.eventDate && b.eventDate <= filterDateTo);
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        cmp = (a.eventDate || "").localeCompare(b.eventDate || "");
      } else {
        cmp = (a.agreedPrice ?? 0) - (b.agreedPrice ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [
    bookings,
    filter,
    search,
    filterEventType,
    filterDateFrom,
    filterDateTo,
    sortKey,
    sortDir,
  ]);

  const hasActiveFilters =
    !!search ||
    filterEventType !== "all" ||
    !!filterDateFrom ||
    !!filterDateTo ||
    filter !== "all";

  function resetFilters() {
    setSearch("");
    setFilterEventType("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilter("all");
  }

  function toggleSort(key: "date" | "amount") {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  /** Event-type breakdown for the pie chart. */
  const pieData = useMemo(() => {
    const totalsByType = new Map<string, number>();
    for (const b of bookings) {
      const key = (b.eventType || "other").toLowerCase();
      totalsByType.set(key, (totalsByType.get(key) ?? 0) + (b.agreedPrice ?? 0));
    }
    const total = Array.from(totalsByType.values()).reduce((s, v) => s + v, 0);
    return Array.from(totalsByType.entries())
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        key,
        label: eventTypeLabel(normalizeEventType(key)),
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
        color: EVENT_COLORS[key] || "#64748B",
      }))
      .sort((a, b) => b.value - a.value);
  }, [bookings]);

  async function cyclePaidStatus(b: Booking) {
    // unpaid → partial → paid → unpaid
    const next =
      b.paidStatus === "paid"
        ? "unpaid"
        : b.paidStatus === "partial"
          ? "paid"
          : "partial";
    setTogglingPaid(b.id);
    // Optimistic update.
    setBookings((prev) =>
      prev.map((x) => (x.id === b.id ? { ...x, paidStatus: next } : x)),
    );
    try {
      const res = await fetch(`/api/booking-requests/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_paid",
          paidStatus: next,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("vendor.venueFinance.updateError"));
        // Rollback.
        setBookings((prev) =>
          prev.map((x) =>
            x.id === b.id ? { ...x, paidStatus: b.paidStatus } : x,
          ),
        );
        return;
      }
      toast.success(
        next === "paid"
          ? t("vendor.venueFinance.markedPaid")
          : next === "partial"
            ? t("vendor.venueFinance.markedPartial")
            : t("vendor.venueFinance.markedUnpaid"),
      );
    } finally {
      setTogglingPaid(null);
    }
  }

  const maxChart = Math.max(1, ...chartData.map((d) => d.total));

  function exportPDF() {
    const rows = bookings.map((b) => {
      const gross = b.agreedPrice ?? 0;
      const commission = commissionByBooking[b.id] ?? 0;
      const net = gross - commission;
      return `<tr>
        <td>#${b.id}</td>
        <td>${b.clientName}</td>
        <td>${b.eventType ? eventTypeLabel(normalizeEventType(b.eventType)) : "—"}</td>
        <td>${b.eventDate ? new Date(b.eventDate).toLocaleDateString("ro-RO") : "—"}</td>
        <td style="text-align:right">${gross}€</td>
        <td style="text-align:right;color:#888">${commission}€</td>
        <td style="text-align:right;color:#0a7">${net}€</td>
        <td>${b.paidStatus === "paid" ? `✓ ${t("vendor.venueFinance.statusPaid")}` : t("vendor.venueFinance.statusPending")}</td>
      </tr>`;
    });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t("vendor.venueFinance.reportTitle")} — ${venueName}</title>
      <style>body{font-family:system-ui;padding:40px;color:#222}
      h1{color:#A08839;margin:0}
      h2{color:#666;font-size:14px;font-weight:normal;margin:4px 0 20px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f5f5f5;padding:10px;text-align:left;border-bottom:2px solid #A08839}
      td{padding:8px 10px;border-bottom:1px solid #eee}
      .summary{display:flex;gap:20px;margin:20px 0;padding:15px;background:#fafafa;border-radius:8px}
      .stat{flex:1}.stat-label{color:#888;font-size:11px;text-transform:uppercase}
      .stat-value{font-size:22px;font-weight:bold;color:#A08839;margin-top:4px}
      @media print{@page{margin:15mm}}</style></head>
      <body>
        <h1>${t("vendor.venueFinance.reportTitle")}</h1>
        <h2>${venueName} · ${t("vendor.venueFinance.generated")} ${new Date().toLocaleDateString("ro-RO")}</h2>
        <div class="summary">
          <div class="stat"><div class="stat-label">${t("vendor.venueFinance.revenueTotal")}</div><div class="stat-value">${stats.revenueTotal}€</div></div>
          <div class="stat"><div class="stat-label">${t("vendor.venueFinance.currentMonthCap")}</div><div class="stat-value">${stats.revenueThisMonth}€</div></div>
          <div class="stat"><div class="stat-label">${t("vendor.venueFinance.platformCommission")}</div><div class="stat-value">${stats.commissionThisMonth}€</div></div>
          <div class="stat"><div class="stat-label">${t("vendor.venueFinance.bookingsMonth")}</div><div class="stat-value">${stats.bookingsThisMonth}</div></div>
        </div>
        <table>
          <thead><tr>
            <th>ID</th><th>${t("auth.roleClient")}</th><th>${t("vendor.venueFinance.colEvent")}</th><th>${t("vendor.venueFinance.colDate")}</th>
            <th style="text-align:right">${t("vendor.venueFinance.colAmount")}</th><th style="text-align:right">${t("vendor.venueFinance.colCommission")}</th>
            <th style="text-align:right">${t("vendor.venueFinance.colNet")}</th><th>${t("vendor.venueFinance.colStatus")}</th>
          </tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
  }

  function exportExcel() {
    const header = [
      "ID",
      t("auth.roleClient"),
      t("vendor.venueFinance.colEvent"),
      t("vendor.venueFinance.colDate"),
      t("vendor.venueFinance.csvAmount"),
      t("vendor.venueFinance.csvCommission"),
      t("vendor.venueFinance.csvNet"),
      t("vendor.venueFinance.csvPaidStatus"),
    ];
    const rows = bookings.map((b) => [
      b.id,
      b.clientName,
      b.eventType ? eventTypeLabel(normalizeEventType(b.eventType)) : "",
      b.eventDate || "",
      b.agreedPrice ?? 0,
      commissionByBooking[b.id] ?? 0,
      (b.agreedPrice ?? 0) - (commissionByBooking[b.id] ?? 0),
      b.paidStatus || "unpaid",
    ]);
    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = String(v);
            return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financiar-${venueName}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("dashboard.financial")}</h1>
          <p className="text-muted-foreground">
            {t("vendor.venueFinance.subtitle")} <strong>{venueName}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
            <FileDown className="h-3.5 w-3.5" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportPDF}
            className="gap-1.5 border-gold/40 text-gold hover:bg-gold/10"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label={t("vendor.venueFinance.revenueMonth")}
          value={`${stats.revenueThisMonth.toLocaleString("ro-RO")}€`}
          subLabel={`${stats.bookingsThisMonth} ${t("vendor.venueFinance.bookingsUnit")}`}
          accent="text-emerald-400"
        />
        <StatCard
          icon={TrendingUp}
          label={t("vendor.venueFinance.revenueTotal")}
          value={`${stats.revenueTotal.toLocaleString("ro-RO")}€`}
          subLabel={t("vendor.venueFinance.allTime")}
          accent="text-gold"
        />
        <StatCard
          icon={Percent}
          label={t("vendor.venueFinance.platformCommission")}
          value={`${stats.commissionThisMonth.toLocaleString("ro-RO")}€`}
          subLabel={t("vendor.venueFinance.currentMonth")}
          accent="text-amber-400"
        />
        <StatCard
          icon={CheckCircle2}
          label={t("vendor.venueFinance.paymentsStatus")}
          value={`${stats.paid} / ${stats.paid + stats.unpaid}`}
          subLabel={`${stats.unpaid} ${t("vendor.venueFinance.unpaidUnit")}`}
          accent="text-blue-400"
        />
      </div>

      {/* Charts: bar (monthly) + pie (by event type) */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold">
                {t("vendor.venueFinance.revenueByMonth")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {chartData.reduce((s, d) => s + d.total, 0).toLocaleString("ro-RO")}€{" "}
                {t("vendor.venueFinance.totalLower")}
              </span>
            </div>
            <div className="flex h-48 items-end gap-1">
              {chartData.map((d) => {
                const pct = (d.total / maxChart) * 100;
                return (
                  <div
                    key={d.month}
                    className="group flex flex-1 flex-col items-center gap-1"
                  >
                    <div className="relative flex h-full w-full flex-col justify-end">
                      <div
                        className="rounded-t-sm bg-gradient-to-t from-gold to-gold/60 transition-all group-hover:from-gold-dark"
                        style={{
                          height: `${pct}%`,
                          minHeight: d.total > 0 ? "4px" : "0",
                        }}
                      />
                      {d.total > 0 && (
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-card px-1.5 py-0.5 text-[10px] font-medium opacity-0 shadow transition-opacity group-hover:opacity-100">
                          {d.total}€
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 font-heading text-base font-semibold">
              {t("vendor.venueFinance.pieTitle")}
            </h2>
            <EventTypePie data={pieData} />
          </CardContent>
        </Card>
      </div>

      {/* Transactions */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-base font-semibold">{t("vendor.venueFinance.transactions")}</h2>
            <div className="flex gap-1">
              {(["all", "paid", "unpaid"] as const).map((f) => {
                const label =
                  f === "all"
                    ? t("common.all")
                    : f === "paid"
                      ? t("vendor.venueFinance.filterPaid")
                      : t("vendor.venueFinance.filterUnpaid");
                const count =
                  f === "all"
                    ? bookings.length
                    : f === "paid"
                      ? stats.paid
                      : stats.unpaid;
                const isActive = filter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-gold/15 text-gold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toolbar: search / event type / date range */}
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-muted/20 p-3">
            <div className="min-w-[180px] flex-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <Search className="mr-1 inline h-3 w-3" /> {t("common.search")}
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("vendor.venueFinance.searchPlaceholder")}
                className="mt-1 h-8 w-full rounded-md border border-border/50 bg-background px-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <Filter className="mr-1 inline h-3 w-3" /> {t("wizard.steps.eventType")}
              </label>
              <select
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value)}
                className="mt-1 h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
              >
                <option value="all">{t("common.all")}</option>
                {availableEventTypes.map((t) => (
                  <option key={t} value={t}>
                    {eventTypeLabel(normalizeEventType(t))}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("vendor.venueFinance.dateFrom")}
              </label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="mt-1 h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("vendor.venueFinance.dateTo")}
              </label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="mt-1 h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
              />
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8"
              >
                {t("catalog.reset")}
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} / {bookings.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {filter === "all"
                ? t("vendor.venueFinance.emptyAll")
                : filter === "paid"
                  ? t("vendor.venueFinance.emptyPaid")
                  : t("vendor.venueFinance.emptyUnpaid")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2">ID</th>
                    <th className="pb-2">{t("auth.roleClient")}</th>
                    <th className="pb-2">{t("vendor.venueFinance.colEvent")}</th>
                    <th className="pb-2">
                      <button
                        type="button"
                        onClick={() => toggleSort("date")}
                        className="inline-flex items-center gap-1 hover:text-gold"
                      >
                        {t("vendor.venueFinance.colDate")}
                        {sortKey === "date" &&
                          (sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          ))}
                      </button>
                    </th>
                    <th className="pb-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("amount")}
                        className="inline-flex items-center gap-1 hover:text-gold"
                      >
                        {t("vendor.venueFinance.colAmount")}
                        {sortKey === "amount" &&
                          (sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          ))}
                      </button>
                    </th>
                    <th className="pb-2 text-right">{t("vendor.venueFinance.colCommission")}</th>
                    <th className="pb-2 text-right">{t("vendor.venueFinance.colNet")}</th>
                    <th className="pb-2">{t("vendor.venueFinance.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const gross = b.agreedPrice ?? 0;
                    const commission = commissionByBooking[b.id] ?? 0;
                    const net = gross - commission;
                    return (
                      <tr
                        key={b.id}
                        className="border-b border-border/20 last:border-0 hover:bg-accent/30"
                      >
                        <td className="py-3 font-mono text-xs text-muted-foreground">
                          #{b.id}
                        </td>
                        <td className="py-3 font-medium">{b.clientName}</td>
                        <td className="py-3 text-muted-foreground">
                          {b.eventType
                            ? eventTypeLabel(normalizeEventType(b.eventType))
                            : "—"}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {b.eventDate ? (
                            <span className="inline-flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3" />
                              {new Date(b.eventDate).toLocaleDateString("ro-RO", {
                                day: "numeric",
                                month: "short",
                                year: "2-digit",
                              })}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 text-right font-medium">
                          {gross}€
                        </td>
                        <td className="py-3 text-right text-muted-foreground">
                          -{commission}€
                        </td>
                        <td className="py-3 text-right font-semibold text-emerald-400">
                          {net}€
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => cyclePaidStatus(b)}
                            disabled={togglingPaid === b.id}
                            title={t("vendor.venueFinance.cycleHint")}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors",
                              b.paidStatus === "paid"
                                ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                                : b.paidStatus === "partial"
                                  ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                                  : "bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25",
                            )}
                          >
                            {togglingPaid === b.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : b.paidStatus === "paid" ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : b.paidStatus === "partial" ? (
                              <Circle className="h-3 w-3 fill-amber-400/50" />
                            ) : (
                              <Clock className="h-3 w-3" />
                            )}
                            {b.paidStatus === "paid"
                              ? t("vendor.venueFinance.statusPaid")
                              : b.paidStatus === "partial"
                                ? t("calendar.legendPartial")
                                : t("vendor.venueFinance.statusPending")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * SVG donut chart of revenue per event type. Slices are drawn as SVG arc
 * paths (no Recharts dependency). The center shows the total; the legend
 * below lists each type with its color, amount, and percentage.
 */
function EventTypePie({
  data,
}: {
  data: Array<{
    key: string;
    label: string;
    value: number;
    pct: number;
    color: string;
  }>;
}) {
  const { t } = useLocale();
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        {t("vendor.venueFinance.emptyAll")}
      </p>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;
  const innerR = 38;

  // Build SVG arc paths for each slice. When only one slice exists, draw a
  // full ring instead of a degenerate arc (start === end gives a blank path).
  let cumulative = 0;
  const slices = data.map((d) => {
    const fraction = d.value / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    return { ...d, startAngle, endAngle, fraction };
  });

  function arcPath(start: number, end: number) {
    const largeArc = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const xi2 = cx + innerR * Math.cos(end);
    const yi2 = cy + innerR * Math.sin(end);
    const xi1 = cx + innerR * Math.cos(start);
    const yi1 = cy + innerR * Math.sin(start);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${xi1} ${yi1} Z`;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-label={t("vendor.venueFinance.pieAria")}
        >
          {slices.length === 1 ? (
            <>
              <circle cx={cx} cy={cy} r={r} fill={slices[0].color} />
              <circle cx={cx} cy={cy} r={innerR} fill="var(--background, #0a0a0a)" />
            </>
          ) : (
            slices.map((s) => (
              <path
                key={s.key}
                d={arcPath(s.startAngle, s.endAngle)}
                fill={s.color}
              >
                <title>
                  {s.label}: {s.value}€ ({s.pct.toFixed(1)}%)
                </title>
              </path>
            ))
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-lg font-bold">{total}€</span>
          <span className="text-[10px] text-muted-foreground">
            {t("vendor.venueFinance.total")}
          </span>
        </div>
      </div>
      <ul className="w-full space-y-1 text-xs">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: d.color }}
            />
            <span className="flex-1 truncate">{d.label}</span>
            <span className="font-medium text-foreground">{d.value}€</span>
            <span className="w-12 text-right text-muted-foreground">
              {d.pct.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subLabel,
  accent,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  subLabel: string;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className={cn("mt-1 font-heading text-3xl font-bold", accent)}>
              {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{subLabel}</p>
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-accent/40", accent)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
