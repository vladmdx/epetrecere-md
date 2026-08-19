"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatRate, type CommissionRules } from "@/lib/commissions/rules";
import { Check, RefreshCw, Settings2, AlertTriangle } from "lucide-react";

interface Row {
  id: number;
  bookingRequestId: number;
  vendorType: "artist" | "venue";
  baseAmount: number;
  currency: string;
  rateBps: number | null;
  amount: number;
  guestCount: number | null;
  tier: string | null;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentNote: string | null;
  clientName: string | null;
  eventDate: string | null;
  artistName: string | null;
  venueName: string | null;
}

interface Totals {
  pending: number;
  paid: number;
  overdue: number;
  count: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "De achitat",
  invoiced: "Facturat",
  paid: "Achitat",
  cancelled: "Anulat",
  waived: "Scutit",
};

const FILTERS = [
  { key: "all", label: "Toate" },
  { key: "pending,invoiced", label: "Neachitate" },
  { key: "paid", label: "Achitate" },
];

export function FinanceClient({ initialRules }: { initialRules: CommissionRules }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({ pending: 0, paid: 0, overdue: 0, count: 0 });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<CommissionRules>(initialRules);
  const [showRules, setShowRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/commissions?status=${encodeURIComponent(filter)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setRows(Array.isArray(data.items) ? data.items : []);
      if (data.totals) setTotals(data.totals);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: number, status: string, extra: Record<string, unknown> = {}) {
    await fetch("/api/commissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, ...extra }),
    });
    await load();
  }

  async function saveRules() {
    setSavingRules(true);
    try {
      await fetch("/api/commissions/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      await load();
      setShowRules(false);
    } finally {
      setSavingRules(false);
    }
  }

  const venueUnset =
    rules.venue.below.rateBps == null &&
    rules.venue.below.fixedAmount == null &&
    rules.venue.atOrAbove.rateBps == null &&
    rules.venue.atOrAbove.fixedAmount == null;

  const cur = rules.currency;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Finanțe</h1>
          <p className="text-sm text-muted-foreground">
            Comisioanele datorate de furnizori. Achitarea se face în afara platformei;
            marchează manual când banii au intrat.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRules((v) => !v)} className="gap-2">
            <Settings2 className="h-4 w-4" /> Reguli comision
          </Button>
          <Button variant="outline" onClick={() => void load()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Reîmprospătează
          </Button>
        </div>
      </div>

      {venueUnset && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">Comisionul pentru săli nu e configurat</p>
            <p className="text-muted-foreground">
              Documentele legale lasă tarifele pentru locații „de aprobat separat", deci nu sunt
              fixate în cod. Până le completezi în „Reguli comision", rezervările de săli
              <strong> nu generează comision</strong> (artiștii sunt taxați normal cu 5%).
            </p>
          </div>
        </div>
      )}

      {showRules && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reguli comision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold">Artiști</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-28"
                  value={rules.artist.rateBps / 100}
                  onChange={(e) =>
                    setRules((r) => ({
                      ...r,
                      artist: { rateBps: Math.round(Number(e.target.value) * 100) },
                    }))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  % din valoarea comenzii confirmate (contractual: 5%)
                </span>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-semibold">Săli — prag pe număr de invitați</p>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Pragul:</span>
                <Input
                  type="number"
                  className="w-28"
                  value={rules.venue.guestThreshold}
                  onChange={(e) =>
                    setRules((r) => ({
                      ...r,
                      venue: { ...r.venue, guestThreshold: Number(e.target.value) },
                    }))
                  }
                />
                <span className="text-sm text-muted-foreground">invitați</span>
              </div>

              {(["below", "atOrAbove"] as const).map((tierKey) => (
                <div key={tierKey} className="mb-3 rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">
                    {tierKey === "below"
                      ? `Sub ${rules.venue.guestThreshold} invitați`
                      : `De la ${rules.venue.guestThreshold} invitați`}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      Procent:
                      <Input
                        type="number"
                        className="w-24"
                        placeholder="—"
                        value={
                          rules.venue[tierKey].rateBps != null
                            ? rules.venue[tierKey].rateBps! / 100
                            : ""
                        }
                        onChange={(e) =>
                          setRules((r) => ({
                            ...r,
                            venue: {
                              ...r.venue,
                              [tierKey]: {
                                rateBps: e.target.value
                                  ? Math.round(Number(e.target.value) * 100)
                                  : null,
                                fixedAmount: null,
                              },
                            },
                          }))
                        }
                      />
                      %
                    </label>
                    <span className="text-xs text-muted-foreground">sau</span>
                    <label className="flex items-center gap-2 text-sm">
                      Sumă fixă:
                      <Input
                        type="number"
                        className="w-24"
                        placeholder="—"
                        value={rules.venue[tierKey].fixedAmount ?? ""}
                        onChange={(e) =>
                          setRules((r) => ({
                            ...r,
                            venue: {
                              ...r.venue,
                              [tierKey]: {
                                rateBps: null,
                                fixedAmount: e.target.value ? Number(e.target.value) : null,
                              },
                            },
                          }))
                        }
                      />
                      {cur}
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => void saveRules()} disabled={savingRules}>
                {savingRules ? "Se salvează…" : "Salvează regulile"}
              </Button>
              <Button variant="ghost" onClick={() => setShowRules(false)}>
                Anulează
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="De achitat" value={`${totals.pending} ${cur}`} />
        <StatCard label="Restante" value={`${totals.overdue} ${cur}`} danger={totals.overdue > 0} />
        <StatCard label="Încasat" value={`${totals.paid} ${cur}`} />
        <StatCard label="Total înregistrări" value={String(totals.count)} />
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Se încarcă…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Niciun comision înregistrat încă. Se creează automat când o rezervare devine
              confirmată și are un preț agreat.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Furnizor</th>
                    <th className="p-3">Client</th>
                    <th className="p-3">Eveniment</th>
                    <th className="p-3 text-right">Valoare</th>
                    <th className="p-3 text-right">Rată</th>
                    <th className="p-3 text-right">Comision</th>
                    <th className="p-3">Scadent</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const overdue =
                      r.dueDate != null &&
                      (r.status === "pending" || r.status === "invoiced") &&
                      new Date(r.dueDate) < new Date();
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3">
                          <div className="font-medium">
                            {r.artistName ?? r.venueName ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.vendorType === "artist" ? "Artist" : "Sală"}
                            {r.guestCount != null && ` · ${r.guestCount} invitați`}
                          </div>
                        </td>
                        <td className="p-3">{r.clientName ?? "—"}</td>
                        <td className="p-3">{r.eventDate ?? "—"}</td>
                        <td className="p-3 text-right">
                          {r.baseAmount} {r.currency}
                        </td>
                        <td className="p-3 text-right">{formatRate(r.rateBps)}</td>
                        <td className="p-3 text-right font-semibold">
                          {r.amount} {r.currency}
                        </td>
                        <td className={`p-3 ${overdue ? "text-red-500" : ""}`}>
                          {r.dueDate ?? "—"}
                        </td>
                        <td className="p-3">
                          <Badge variant={r.status === "paid" ? "default" : "outline"}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {r.status !== "paid" ? (
                            <Button
                              size="sm"
                              className="gap-1"
                              onClick={() =>
                                void patch(r.id, "paid", { method: "manual" })
                              }
                            >
                              <Check className="h-3.5 w-3.5" /> Achitat
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void patch(r.id, "pending")}
                            >
                              Anulează
                            </Button>
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
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${danger ? "text-red-500" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
