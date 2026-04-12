import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { homepageSections } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

// GET — return homepage sections ordered by sortOrder
// Public: only visible sections. Admin with ?all=true: all sections.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all");

  if (all === "true") {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
    const rows = await db
      .select()
      .from(homepageSections)
      .orderBy(asc(homepageSections.sortOrder));
    return NextResponse.json(rows);
  }

  const rows = await db
    .select()
    .from(homepageSections)
    .where(eq(homepageSections.isVisible, true))
    .orderBy(asc(homepageSections.sortOrder));

  return NextResponse.json(rows);
}

const sectionSchema = z.object({
  id: z.number(),
  type: z.string(),
  sortOrder: z.number(),
  isVisible: z.boolean(),
});

const bulkSchema = z.object({
  sections: z.array(sectionSchema),
});

// PUT — bulk update sort order and visibility for all sections
export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Update each section in a transaction
  await db.transaction(async (tx) => {
    for (const section of parsed.data.sections) {
      await tx
        .update(homepageSections)
        .set({
          sortOrder: section.sortOrder,
          isVisible: section.isVisible,
        })
        .where(eq(homepageSections.id, section.id));
    }
  });

  return NextResponse.json({ success: true });
}
