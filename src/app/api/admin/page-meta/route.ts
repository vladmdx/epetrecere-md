import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageMeta } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidatePath } from "next/cache";

// Admin-only CRUD for page_meta entries. Used by /admin/meta to override
// SEO <title> / description on static pages and tools — homepage,
// /calculatoare, /calculatoare/buget, etc.

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }
  const rows = await db
    .select()
    .from(pageMeta)
    .orderBy(asc(pageMeta.groupName), asc(pageMeta.path));
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const update: Partial<typeof pageMeta.$inferInsert> = {};
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const v = body.title;
    update.title =
      v === null || v === ""
        ? null
        : typeof v === "string"
          ? v.trim().slice(0, 70)
          : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    const v = body.description;
    update.description =
      v === null || v === ""
        ? null
        : typeof v === "string"
          ? v.trim().slice(0, 200)
          : null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  update.updatedAt = new Date();

  const [updated] = await db
    .update(pageMeta)
    .set(update)
    .where(eq(pageMeta.id, id))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Bust the cache for the affected route so the new title shows up on the
  // next visit instead of waiting for ISR.
  try {
    revalidatePath(updated.path);
  } catch {
    /* not in request scope — next periodic revalidation will catch it */
  }
  return NextResponse.json(updated);
}
