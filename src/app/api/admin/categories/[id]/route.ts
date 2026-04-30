import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidatePath } from "next/cache";

// Admin-only PATCH: update editable fields on a single category.
// Currently scoped to image + badge — the only fields editable from the
// admin panel today. Add more by extending the allowlist below.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const update: Partial<typeof categories.$inferInsert> = {};

  // Whitelist + sanitize. `null` clears the field; `undefined` leaves it.
  if (Object.prototype.hasOwnProperty.call(body, "imageUrl")) {
    const v = body.imageUrl;
    if (v === null || v === "") {
      update.imageUrl = null;
    } else if (typeof v === "string") {
      update.imageUrl = v.slice(0, 2000);
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "badge")) {
    const v = body.badge;
    if (v === null || v === "") {
      update.badge = null;
    } else if (typeof v === "string") {
      update.badge = v.trim().slice(0, 40);
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "imageAlt")) {
    const v = body.imageAlt;
    if (v === null || v === "") {
      update.imageAlt = null;
    } else if (typeof v === "string") {
      update.imageAlt = v.trim().slice(0, 200);
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "icon")) {
    const v = body.icon;
    if (v === null || v === "") {
      update.icon = null;
    } else if (typeof v === "string") {
      update.icon = v.trim().slice(0, 10); // emoji or short symbol
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(categories)
    .set(update)
    .where(eq(categories.id, numericId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Bust the ISR caches so /, /categorii, /categorie/[slug] re-render with
  // the new image/badge on the next visit instead of waiting for the hourly
  // revalidation cycle.
  try {
    revalidatePath("/");
    revalidatePath("/categorii");
    revalidatePath(`/categorie/${updated.slug}`);
  } catch {
    // revalidatePath occasionally throws when not in a request scope;
    // safe to ignore — the next periodic revalidation will pick it up.
  }

  return NextResponse.json(updated);
}
