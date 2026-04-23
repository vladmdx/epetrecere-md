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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  commissionPct: number;
}

const EVENT_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  nunta: "Nuntă",
  baptism: "Botez",
  botez: "Botez",
  cumatrie: "Cumătrie",
  corporate: "Corporate",
  birthday: "Aniversare",
  aniversare: "Aniversare",
};

export function VenueFinanciarClient({
  venueName,
  stats,
  bookings,
  chartData,
  commissionPct,
}: Props) {
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid">("all");

  const filtered = useMemo(() => {
    if (filter === "paid") return bookings.filter((b) => b.paidStatus === "paid");
    if (filter === "unpaid")
      return bookings.filter((b) => b.paidStatus !== "paid");
    return bookings;
  }, [bookings, filter]);

  const maxChart = Math.max(1, ...chartData.map((d) => d.total));

  function exportPDF() {
    const rows = bookings.map((b) => {
      const gross = b.agreedPrice ?? 0;
      const commission = Math.round(gross * commissionPct);
      const net = gross - commission;
      return `<tr>
        <td>#${b.id}</td>
        <td>${b.clientName}</td>
        <td>${EVENT_LABELS[(b.eventType || "").toLowerCase()] || b.eventType || "—"}</td>
        <td>${b.eventDate ? new Date(b.eventDate).toLocaleDateString("ro-RO") : "—"}</td>
        <td style="text-align:right">${gross}€</td>
        <td style="text-align:right;color:#888">${commission}€</td>
        <td style="text-align:right;color:#0a7">${net}€</td>
        <td>${b.paidStatus === "paid" ? "✓ Plătit" : "În așteptare"}</td>
      </tr>`;
    });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Raport Financiar — ${venueName}</title>
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
        <h1>Raport Financiar</h1>
        <h2>${venueName} · Generat ${new Date().toLocaleDateString("ro-RO")}</h2>
        <div class="summary">
          <div class="stat"><div class="stat-label">Venituri Total</div><div class="stat-value">${stats.revenueTotal}€</div></div>
          <div class="stat"><div class="stat-label">Luna Curentă</div><div class="stat-value">${stats.revenueThisMonth}€</div></div>
          <div class="stat"><div class="stat-label">Comision (${Math.round(commissionPct * 100)}%)</div><div class="stat-value">${stats.commissionThisMonth}€</div></div>
          <div class="stat"><div class="stat-label">Rezervări Luna</div><div class="stat-value">${stats.bookingsThisMonth}</div></div>
        </div>
        <table>
          <thead><tr>
            <th>ID</th><th>Client</th><th>Eveniment</th><th>Data</th>
            <th style="text-align:right">Sumă</th><th style="text-align:right">Comision</th>
            <th style="text-align:right">Net</th><th>Status</th>
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
    const header = ["ID", "Client", "Eveniment", "Data", "Suma €", "Comision €", "Net €", "Status plată"];
    const rows = bookings.map((b) => [
      b.id,
      b.clientName,
      EVENT_LABELS[(b.eventType || "").toLowerCase()] || b.eventType || "",
      b.eventDate || "",
      b.agreedPrice ?? 0,
      Math.round((b.agreedPrice ?? 0) * commissionPct),
      (b.agreedPrice ?? 0) - Math.round((b.agreedPrice ?? 0) * commissionPct),
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
          <h1 className="font-heading text-2xl font-bold">Financiar</h1>
          <p className="text-muted-foreground">
            Venituri, comision platformă și tranzacții pentru <strong>{venueName}</strong>
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
          label="Venituri luna"
          value={`${stats.revenueThisMonth.toLocaleString("ro-RO")}€`}
          subLabel={`${stats.bookingsThisMonth} rezervări`}
          accent="text-emerald-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Venituri Total"
          value={`${stats.revenueTotal.toLocaleString("ro-RO")}€`}
          subLabel="All time"
          accent="text-gold"
        />
        <StatCard
          icon={Percent}
          label={`Comision platformă (${Math.round(commissionPct * 100)}%)`}
          value={`${stats.commissionThisMonth.toLocaleString("ro-RO")}€`}
          subLabel="Luna curentă"
          accent="text-amber-400"
        />
        <StatCard
          icon={CheckCircle2}
          label="Status plăți"
          value={`${stats.paid} / ${stats.paid + stats.unpaid}`}
          subLabel={`${stats.unpaid} neplătite`}
          accent="text-blue-400"
        />
      </div>

      {/* Monthly chart */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">
              Venituri pe luni (ultimele 12 luni)
            </h2>
            <span className="text-xs text-muted-foreground">
              {chartData.reduce((s, d) => s + d.total, 0).toLocaleString("ro-RO")}€ total
            </span>
          </div>
          <div className="flex h-48 items-end gap-1">
            {chartData.map((d) => {
              const pct = (d.total / maxChart) * 100;
              return (
                <div key={d.month} className="group flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex h-full w-full flex-col justify-end">
                    <div
                      className="rounded-t-sm bg-gradient-to-t from-gold to-gold/60 transition-all group-hover:from-gold-dark"
                      style={{ height: `${pct}%`, minHeight: d.total > 0 ? "4px" : "0" }}
                    />
                    {d.total > 0 && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-card px-1.5 py-0.5 text-[10px] font-medium opacity-0 shadow transition-opacity group-hover:opacity-100">
                        {d.total}€
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{d.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">Tranzacții</h2>
            <div className="flex gap-1">
              {(["all", "paid", "unpaid"] as const).map((f) => {
                const label = f === "all" ? "Toate" : f === "paid" ? "Plătite" : "Neplătite";
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

          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nicio tranzacție{filter !== "all" ? ` ${filter === "paid" ? "plătită" : "neplătită"}` : ""} încă.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2">ID</th>
                    <th className="pb-2">Client</th>
                    <th className="pb-2">Eveniment</th>
                    <th className="pb-2">Data</th>
                    <th className="pb-2 text-right">Sumă</th>
                    <th className="pb-2 text-right">Comision</th>
                    <th className="pb-2 text-right">Net</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const gross = b.agreedPrice ?? 0;
                    const commission = Math.round(gross * commissionPct);
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
                          {EVENT_LABELS[(b.eventType || "").toLowerCase()] ||
                            b.eventType ||
                            "—"}
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
                          {b.paidStatus === "paid" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Plătit
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-400">
                              <Clock className="h-3 w-3" />
                              În așteptare
                            </span>
                          )}
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
