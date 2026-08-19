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

const STATUS_LABEL: Record<string, string> = {
  pending: "De achitat",
  invoiced: "Facturat",
  paid: "Achitat",
  cancelled: "Anulat",
  waived: "Scutit",
};

export function CommissionPanel() {
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
        <CardTitle className="text-base">Comision platformă</CardTitle>
        <p className="text-sm text-muted-foreground">
          Se calculează la confirmarea rezervării. Achitarea se face prin transfer, în
          termenul indicat; administratorul confirmă încasarea.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="De achitat" value={`${totals.pending} ${cur}`} />
          <Stat label="Restant" value={`${totals.overdue} ${cur}`} danger={totals.overdue > 0} />
          <Stat label="Achitat" value={`${totals.paid} ${cur}`} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Client</th>
                <th className="py-2">Eveniment</th>
                <th className="py-2 text-right">Valoare</th>
                <th className="py-2 text-right">Rată</th>
                <th className="py-2 text-right">Comision</th>
                <th className="py-2">Scadent</th>
                <th className="py-2">Status</th>
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
                      {r.baseAmount} {r.currency}
                    </td>
                    <td className="py-2 text-right">{formatRate(r.rateBps)}</td>
                    <td className="py-2 text-right font-semibold">
                      {r.amount} {r.currency}
                    </td>
                    <td className={`py-2 ${overdue ? "text-red-500" : ""}`}>
                      {r.dueDate ?? "—"}
                    </td>
                    <td className="py-2">
                      <Badge variant={r.status === "paid" ? "default" : "outline"}>
                        {STATUS_LABEL[r.status] ?? r.status}
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
