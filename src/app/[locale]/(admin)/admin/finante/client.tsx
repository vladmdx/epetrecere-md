"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatRate, type CommissionRules } from "@/lib/commissions/rules";
import { Check, RefreshCw, Settings2, AlertTriangle, ListChecks } from "lucide-react";
import { formatAmount } from "@/lib/format/price";
import { useLocale } from "@/hooks/use-locale";
import { toast } from "sonner";

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

const STATUS_LABEL_KEY: Record<string, string> = {
  pending: "adminUi.finance.statusPending",
  invoiced: "adminUi.finance.statusInvoiced",
  paid: "adminUi.finance.statusPaid",
  cancelled: "adminUi.finance.statusCancelled",
  waived: "adminUi.finance.statusWaived",
};

const FILTERS = [
  { key: "all", labelKey: "common.all" },
  { key: "pending,invoiced", labelKey: "adminUi.finance.filterUnpaid" },
  { key: "paid", labelKey: "adminUi.finance.filterPaid" },
];

export function FinanceClient({ initialRules }: { initialRules: CommissionRules }) {
  const { t } = useLocale();
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({ pending: 0, paid: 0, overdue: 0, count: 0 });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<CommissionRules>(initialRules);
  const [reconciling, setReconciling] = useState(false);

  /**
   * Fees are raised by a non-blocking hook when a booking is confirmed, so a
   * transient failure can leave a confirmed order with no ledger row and only
   * a server log to show for it. This walks every confirmed order and creates
   * what is missing. Idempotent — safe to press at any time.
   */
  async function reconcile() {
    setReconciling(true);
    try {
      const res = await fetch("/api/commissions", { method: "POST" });
      if (!res.ok) throw new Error();
      const { created } = (await res.json()) as { created: number };
      toast.success(
        created > 0
          ? t("adminUi.finance.toastCreated", { count: created })
          : t("adminUi.finance.toastNothingToCreate"),
      );
      await load();
    } catch {
      toast.error(t("adminUi.finance.toastSyncFailed"));
    } finally {
      setReconciling(false);
    }
  }
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
          <h1 className="font-heading text-2xl font-bold">{t("adminUi.finance.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("adminUi.finance.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRules((v) => !v)} className="gap-2">
            <Settings2 className="h-4 w-4" /> {t("adminUi.finance.rules")}
          </Button>
          <Button variant="outline" onClick={() => void load()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> {t("adminUi.finance.refresh")}
          </Button>
          <Button
            variant="outline"
            disabled={reconciling}
            onClick={() => void reconcile()}
            className="gap-2"
            title={t("adminUi.finance.syncHint")}
          >
            <ListChecks className="h-4 w-4" /> {t("adminUi.finance.sync")}
          </Button>
        </div>
      </div>

      {venueUnset && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">{t("adminUi.finance.venueUnsetTitle")}</p>
            <p className="text-muted-foreground">
              {t("adminUi.finance.venueUnsetBody1")}
              <strong> {t("adminUi.finance.venueUnsetStrong")}</strong>{" "}
              {t("adminUi.finance.venueUnsetBody2")}
            </p>
          </div>
        </div>
      )}

      {showRules && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("adminUi.finance.rules")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold">{t("adminUi.finance.artists")}</p>
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
                  {t("adminUi.finance.artistRateHint")}
                </span>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-semibold">{t("adminUi.finance.venueThresholdTitle")}</p>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t("adminUi.finance.thresholdLabel")}</span>
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
                <span className="text-sm text-muted-foreground">{t("common.guests")}</span>
              </div>

              {(["below", "atOrAbove"] as const).map((tierKey) => (
                <div key={tierKey} className="mb-3 rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">
                    {tierKey === "below"
                      ? t("adminUi.finance.tierBelow", { n: rules.venue.guestThreshold })
                      : t("adminUi.finance.tierAtOrAbove", { n: rules.venue.guestThreshold })}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      {t("adminUi.finance.percentLabel")}
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
                    <span className="text-xs text-muted-foreground">{t("common.or")}</span>
                    <label className="flex items-center gap-2 text-sm">
                      {t("adminUi.finance.fixedAmountLabel")}
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
                {savingRules ? t("adminUi.finance.saving") : t("adminUi.finance.saveRules")}
              </Button>
              <Button variant="ghost" onClick={() => setShowRules(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t("adminUi.finance.statPending")} value={`${totals.pending} ${cur}`} />
        <StatCard label={t("adminUi.finance.statOverdue")} value={`${totals.overdue} ${cur}`} danger={totals.overdue > 0} />
        <StatCard label={t("adminUi.finance.statCollected")} value={`${totals.paid} ${cur}`} />
        <StatCard label={t("adminUi.finance.statTotalRows")} value={String(totals.count)} />
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {t(f.labelKey)}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">{t("adminUi.finance.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t("adminUi.finance.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("adminUi.finance.colVendor")}</th>
                    <th className="p-3">{t("adminUi.finance.colClient")}</th>
                    <th className="p-3">{t("adminUi.finance.colEvent")}</th>
                    <th className="p-3 text-right">{t("adminUi.finance.colValue")}</th>
                    <th className="p-3 text-right">{t("adminUi.finance.colRate")}</th>
                    <th className="p-3 text-right">{t("adminUi.finance.colCommission")}</th>
                    <th className="p-3">{t("adminUi.finance.colDue")}</th>
                    <th className="p-3">{t("adminUi.finance.colStatus")}</th>
                    <th className="p-3">{t("adminUi.finance.colActions")}</th>
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
                            {r.vendorType === "artist" ? t("adminUi.finance.vendorArtist") : t("adminUi.finance.vendorVenue")}
                            {r.guestCount != null && ` · ${r.guestCount} ${t("common.guests")}`}
                          </div>
                        </td>
                        <td className="p-3">{r.clientName ?? "—"}</td>
                        <td className="p-3">{r.eventDate ?? "—"}</td>
                        <td className="p-3 text-right">
                          {formatAmount(r.baseAmount, r.currency)}
                        </td>
                        <td className="p-3 text-right">{formatRate(r.rateBps)}</td>
                        <td className="p-3 text-right font-semibold">
                          {formatAmount(r.amount, r.currency)}
                        </td>
                        <td className={`p-3 ${overdue ? "text-red-500" : ""}`}>
                          {r.dueDate ?? "—"}
                        </td>
                        <td className="p-3">
                          <Badge variant={r.status === "paid" ? "default" : "outline"}>
                            {STATUS_LABEL_KEY[r.status] ? t(STATUS_LABEL_KEY[r.status]!) : r.status}
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
                              <Check className="h-3.5 w-3.5" /> {t("adminUi.finance.markPaid")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void patch(r.id, "pending")}
                            >
                              {t("common.cancel")}
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
