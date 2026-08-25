"use client";

/**
 * Per-vendor breakdown: who was asked, who closed, what they billed, and what
 * they owe the platform. Sorting is client-side because the whole table is
 * already in memory — the row count is bounded by the vendors who had a
 * booking in the window, not by the catalogue.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Building2, Search, User } from "lucide-react";
import { formatAmount } from "@/lib/format/price";
import type { VendorRow } from "@/lib/db/queries/admin-stats";

type SortKey = "name" | "requests" | "orders" | "gmv" | "commissionBilled" | "commissionPaid";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Furnizor", numeric: false },
  { key: "requests", label: "Solicitări", numeric: true },
  { key: "orders", label: "Comenzi", numeric: true },
  { key: "gmv", label: "Venit furnizor", numeric: true },
  { key: "commissionBilled", label: "Comision datorat", numeric: true },
  { key: "commissionPaid", label: "Comision achitat", numeric: true },
];

export function VendorTable({ rows }: { rows: VendorRow[] }) {
  const [sort, setSort] = useState<SortKey>("gmv");
  const [desc, setDesc] = useState(true);
  const [q, setQ] = useState("");

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => r.name.toLowerCase().includes(needle))
      : rows;
    return [...filtered].sort((a, b) => {
      const va = a[sort];
      const vb = b[sort];
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, "ro")
          : Number(va) - Number(vb);
      return desc ? -cmp : cmp;
    });
  }, [rows, sort, desc, q]);

  const totals = useMemo(
    () =>
      view.reduce(
        (t, r) => ({
          requests: t.requests + r.requests,
          orders: t.orders + r.orders,
          gmv: t.gmv + r.gmv,
          billed: t.billed + r.commissionBilled,
          paid: t.paid + r.commissionPaid,
        }),
        { requests: 0, orders: 0, gmv: 0, billed: 0, paid: 0 },
      ),
    [view],
  );

  function toggle(key: SortKey) {
    if (key === sort) setDesc((d) => !d);
    else {
      setSort(key);
      setDesc(key !== "name");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h3 className="text-sm font-semibold">Pe furnizor</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cine de la ce artist sau sală a rezervat și cât are de achitat.
          </p>
        </div>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută furnizor"
            aria-label="Caută furnizor"
            className="w-36 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {view.length === 0 ? (
        <p className="p-8 text-center text-xs text-muted-foreground">
          Niciun furnizor cu activitate în perioada selectată.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`px-4 py-2 font-medium ${c.numeric ? "text-right" : "text-left"}`}
                    aria-sort={sort === c.key ? (desc ? "descending" : "ascending") : "none"}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground ${sort === c.key ? "text-foreground" : ""}`}
                    >
                      {c.label}
                      {sort === c.key &&
                        (desc ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUp className="h-3 w-3" />
                        ))}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={`${r.type}-${r.id}`} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={r.type === "artist" ? `/artisti/${r.slug}` : `/sali/${r.slug}`}
                      className="flex items-center gap-2 hover:text-gold"
                    >
                      {r.type === "artist" ? (
                        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{r.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.requests}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.orders}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatAmount(r.gmv)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatAmount(r.commissionBilled)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.commissionPaid > 0 ? (
                      <span className="text-success">{formatAmount(r.commissionPaid)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-xs font-semibold">
                <td className="px-4 py-2.5">Total ({view.length})</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totals.requests}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totals.orders}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatAmount(totals.gmv)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatAmount(totals.billed)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatAmount(totals.paid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
