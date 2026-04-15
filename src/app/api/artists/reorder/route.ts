import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.number(),
    sortOrder: z.number(),
  })),
});

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const body = await req.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  await Promise.all(
    parsed.data.items.map((item) =>
      db.update(artists).set({ sortOrder: item.sortOrder }).where(eq(artists.id, item.id))
    ),
  );

  return NextResponse.json({ success: true });
}
