// Admin audit log viewer — read-only table of recent admin actions.
// Lists the last 200 entries with filters by action prefix + admin user.
// Useful for "who deleted this?" forensics + monthly platform reports.

import { desc, eq, like, and } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { adminAuditLog, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { ArrowLeft, Clock, User } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ action?: string; admin?: string }>;
}

export default async function AuditLogPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    if (admin.status === 401) redirect("/sign-in?redirect_url=/admin/audit");
    redirect("/");
  }

  const sp = await searchParams;
  const actionFilter = sp.action?.trim() || null;
  const adminFilter = sp.admin?.trim() || null;

  const conditions = [];
  if (actionFilter) conditions.push(like(adminAuditLog.action, `${actionFilter}%`));
  if (adminFilter) conditions.push(eq(adminAuditLog.adminUserId, adminFilter));

  const rows = await db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      entity: adminAuditLog.entity,
      entityIds: adminAuditLog.entityIds,
      metadata: adminAuditLog.metadata,
      ip: adminAuditLog.ip,
      createdAt: adminAuditLog.createdAt,
      adminEmail: users.email,
      adminName: users.name,
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(users.id, adminAuditLog.adminUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(200);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-3 w-3" /> Admin
        </Link>
      </div>

      <div>
        <h1 className="font-heading text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Ultimele 200 acțiuni sensibile pe platformă.
        </p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-2" method="get">
        <input
          type="text"
          name="action"
          placeholder="Prefix acțiune (ex: bulk)"
          defaultValue={actionFilter ?? ""}
          className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm"
        />
        <input
          type="text"
          name="admin"
          placeholder="UUID admin"
          defaultValue={adminFilter ?? ""}
          className="w-72 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm font-mono"
        />
        <button
          type="submit"
          className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-[#0D0D0D] hover:bg-gold-dark"
        >
          Filtrează
        </button>
        {(actionFilter || adminFilter) && (
          <Link
            href="/admin/audit"
            className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted"
          >
            Resetează
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-border/40 bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border/40 bg-muted/30">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="p-3">Când</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Acțiune</th>
              <th className="p-3">Entitate</th>
              <th className="p-3">IDs</th>
              <th className="p-3">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-12 text-center text-muted-foreground"
                >
                  Niciun eveniment înregistrat.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/20 last:border-0 hover:bg-muted/20"
                >
                  <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(r.createdAt).toLocaleString("ro-RO")}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <User className="h-3 w-3 text-muted-foreground" />
                      {r.adminName || r.adminEmail || "—"}
                    </div>
                  </td>
                  <td className="p-3">
                    <code className="rounded bg-gold/10 px-1.5 py-0.5 text-xs text-gold">
                      {r.action}
                    </code>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.entity || "—"}
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">
                    {Array.isArray(r.entityIds) && r.entityIds.length > 0
                      ? r.entityIds.length <= 3
                        ? r.entityIds.join(", ")
                        : `${r.entityIds.slice(0, 3).join(", ")}… (+${r.entityIds.length - 3})`
                      : "—"}
                  </td>
                  <td className="p-3 font-mono text-[10px] text-muted-foreground/80">
                    {r.metadata && Object.keys(r.metadata).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer">Detalii</summary>
                        <pre className="mt-1 max-w-xs whitespace-pre-wrap break-words">
                          {JSON.stringify(r.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground/70">
        Păstrăm toate acțiunile — fără limite de retenție. Poți naviga direct
        la o entitate căutând după ID.
      </p>
    </div>
  );
}
