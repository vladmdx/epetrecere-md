// Admin bulk operations — select multiple artists/venues in the admin
// list and apply an action: activate / deactivate / feature / unfeature /
// delete.
//
// Access: requireAdmin (already standard for /api/admin/*).
//
// Body: { entity: "artist" | "venue", ids: number[], action: string }

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, venues } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/audit/log";

const schema = z.object({
  entity: z.enum(["artist", "venue"]),
  ids: z.array(z.number().int().positive()).min(1).max(200),
  action: z.enum([
    "activate",
    "deactivate",
    "feature",
    "unfeature",
    "delete",
  ]),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.error },
      { status: admin.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { entity, ids, action } = parsed.data;
  const table = entity === "artist" ? artists : venues;

  let affected = 0;
  if (action === "delete") {
    const result = await db
      .delete(table)
      .where(inArray(table.id, ids))
      .returning({ id: table.id });
    affected = result.length;
  } else {
    const patch: Record<string, boolean> = {};
    if (action === "activate") patch.isActive = true;
    if (action === "deactivate") patch.isActive = false;
    if (action === "feature") patch.isFeatured = true;
    if (action === "unfeature") patch.isFeatured = false;

    const result = await db
      .update(table)
      .set({ ...patch, updatedAt: new Date() })
      .where(inArray(table.id, ids))
      .returning({ id: table.id });
    affected = result.length;
  }

  // Best-effort audit log (don't fail the request if audit layer errors)
  await logAdminAction({
    adminUserId: admin.userId,
    action: `bulk.${action}`,
    entity,
    entityIds: ids,
    metadata: { affected },
  }).catch((err) =>
    console.error("[admin/bulk] audit log failed:", err),
  );

  return NextResponse.json({ success: true, affected });
}
