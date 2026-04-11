import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artistPackages, artists, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// M1 #2 — Update / delete a single artist package. Owner-only.

const updateSchema = z.object({
  nameRo: z.string().min(2).max(200).optional(),
  nameRu: z.string().max(200).nullable().optional(),
  nameEn: z.string().max(200).nullable().optional(),
  descriptionRo: z.string().max(2000).nullable().optional(),
  descriptionRu: z.string().max(2000).nullable().optional(),
  descriptionEn: z.string().max(2000).nullable().optional(),
  price: z.number().int().min(0).nullable().optional(),
  durationHours: z.number().min(0).max(240).nullable().optional(),
  isVisible: z.boolean().optional(),
});

async function loadOwnedPackage(id: number) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { ok: false as const, status: 401, error: "Unauthorized" };

  const [row] = await db
    .select({
      pkgId: artistPackages.id,
      artistId: artistPackages.artistId,
      ownerId: artists.userId,
    })
    .from(artistPackages)
    .leftJoin(artists, eq(artists.id, artistPackages.artistId))
    .where(eq(artistPackages.id, id))
    .limit(1);

  if (!row) return { ok: false as const, status: 404, error: "Not found" };

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return { ok: false as const, status: 403, error: "Forbidden" };

  if (appUser.role !== "admin" && row.ownerId !== appUser.id) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, pkgId: row.pkgId, artistId: row.artistId };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const pkgId = Number(id);
  if (!Number.isFinite(pkgId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const owner = await loadOwnedPackage(pkgId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  await db
    .update(artistPackages)
    .set(parsed.data)
    .where(eq(artistPackages.id, pkgId));

  const [updated] = await db
    .select()
    .from(artistPackages)
    .where(eq(artistPackages.id, pkgId))
    .limit(1);

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const pkgId = Number(id);
  if (!Number.isFinite(pkgId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const owner = await loadOwnedPackage(pkgId);
  if (!owner.ok) {
    return NextResponse.json({ error: owner.error }, { status: owner.status });
  }

  await db.delete(artistPackages).where(eq(artistPackages.id, pkgId));
  return NextResponse.json({ success: true });
}
