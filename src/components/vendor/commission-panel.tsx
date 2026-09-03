"use client";

/**
 * Vendor-facing view of what they owe the platform. Read-only by design —
 * only an admin can mark a fee settled, since the money moves off-platform.
 * The API scopes rows to the signed-in vendor, so this component never needs
 * to pass an id.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRate } from "@/lib/commissions/rules";
import { formatAmount } from "@/lib/format/price";
import { useLocale } from "@/hooks/use-locale";

interface Row {
  id: number;
  amount: number;
  baseAmount: number;
  currency: string;
  rateBps: number | null;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  clientName: string | null;
  eventDate: string | null;
  guestCount: number | null;
}

/** Row status → translation key. The status itself is the API value, not copy. */
const STATUS_KEY: Record<string, string> = {
  pending: "vendor.commission.statusPending",
  invoiced: "vendor.commission.statusInvoiced",
  paid: "vendor.commission.statusPaid",
  cancelled: "vendor.commission.statusCancelled",
  waived: "vendor.commission.statusWaived",
};

export function CommissionPanel() {
  const { t } = useLocale();
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({ pending: 0, paid: 0, overdue: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/commissions", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setRows(Array.isArray(data.items) ? data.items : []);
        if (data.totals) setTotals(data.totals);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return null;
  if (rows.length === 0 && totals.count === 0) return null;

  const cur = rows[0]?.currency ?? "EUR";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("vendor.commission.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("vendor.commission.description")}
        </p>
        <p className="text-sm text-muted-foreground">{t("pricing.fee2")} {t("pricing.fee4")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={t("vendor.commission.statusPending")} value={`${totals.pending} ${cur}`} />
          <Stat
            label={t("vendor.commission.totalOverdue")}
            value={`${totals.overdue} ${cur}`}
            danger={totals.overdue > 0}
          />
          <Stat label={t("vendor.commission.statusPaid")} value={`${totals.paid} ${cur}`} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">{t("vendor.commission.colClient")}</th>
                <th className="py-2">{t("vendor.commission.colEvent")}</th>
                <th className="py-2 text-right">{t("vendor.commission.colValue")}</th>
                <th className="py-2 text-right">{t("vendor.commission.colRate")}</th>
                <th className="py-2 text-right">{t("vendor.commission.colFee")}</th>
                <th className="py-2">{t("vendor.commission.colDue")}</th>
                <th className="py-2">{t("vendor.commission.colStatus")}</th>
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
                    <td className="py-2">{r.clientName ?? "—"}</td>
                    <td className="py-2">{r.eventDate ?? "—"}</td>
                    <td className="py-2 text-right">
                      {formatAmount(r.baseAmount, r.currency)}
                    </td>
                    <td className="py-2 text-right">{formatRate(r.rateBps)}</td>
                    <td className="py-2 text-right font-semibold">
                      {formatAmount(r.amount, r.currency)}
                    </td>
                    <td className={`py-2 ${overdue ? "text-red-500" : ""}`}>
                      {r.dueDate ?? "—"}
                    </td>
                    <td className="py-2">
                      <Badge variant={r.status === "paid" ? "default" : "outline"}>
                        {STATUS_KEY[r.status] ? t(STATUS_KEY[r.status]) : r.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${danger ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}
