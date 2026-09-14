// Admin bulk operations — select multiple artists/venues in the admin
// list and apply an action: deactivate / feature / unfeature / delete.
// `activate` remains in the input union only to return a typed instruction to
// use the canonical per-registration approval flow.
//
// Access: requireAdmin (already standard for /api/admin/*).
//
// Body: { entity: "artist" | "venue", ids: number[], action: string }

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, bookingRequests, venues } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/audit/log";
import { revalidateVendorCatalog } from "@/lib/vendors/revalidate";
import { acquireLegalScopeLocks } from "@/lib/booking/advisory-locks";
import { getLockedAppUserById } from "@/lib/venue-access";

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

  const { entity, action } = parsed.data;
  if (action === "activate") {
    return NextResponse.json(
      {
        error: "Folosește fluxul individual de aprobare pentru activarea partenerilor.",
        code: "APPROVAL_FLOW_REQUIRED",
      },
      { status: 409 },
    );
  }
  // A stable, duplicate-free order is part of the locking contract for bulk
  // mutations. Two overlapping admin requests must acquire vendor parents in
  // the same order before changing them or touching booking FK rows.
  const ids = [...new Set(parsed.data.ids)].sort((a, b) => a - b);

  const mutation = await db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLocks(tx, { userIds: [admin.userId] });
    const lockedAdmin = await getLockedAppUserById(admin.userId, executor);
    if (!lockedAdmin?.isGlobalAdmin) {
      return { ok: false as const, status: 403, error: "Admin only" };
    }

    if (action === "delete") {
      if (entity === "artist") {
        const locked = await tx
          .select({
            id: artists.id,
            nameRo: artists.nameRo,
            slug: artists.slug,
          })
          .from(artists)
          .where(inArray(artists.id, ids))
          .orderBy(asc(artists.id))
          .for("update");
        if (locked.length === 0) {
          return { ok: true as const, changedSlugs: [] as string[] };
        }

        // Preserve the historical counterparty before artist_id is cleared by
        // ON DELETE SET NULL. Parent locks make this race-safe with contract
        // signing, which acquires the same vendor lock before its booking lock.
        for (const artist of locked) {
          await tx
            .update(bookingRequests)
            .set({
              artistNameSnapshot: sql`COALESCE(NULLIF(BTRIM(${bookingRequests.artistNameSnapshot}), ''), ${artist.nameRo})`,
            })
            .where(eq(bookingRequests.artistId, artist.id));
        }

        await tx
          .delete(artists)
          .where(inArray(artists.id, locked.map((artist) => artist.id)));
        return {
          ok: true as const,
          changedSlugs: locked.map((artist) => artist.slug),
        };
      }

      const locked = await tx
        .select({ id: venues.id, slug: venues.slug })
        .from(venues)
        .where(inArray(venues.id, ids))
        .orderBy(asc(venues.id))
        .for("update");
      if (locked.length === 0) {
        return { ok: true as const, changedSlugs: [] as string[] };
      }

      await tx
        .delete(venues)
        .where(inArray(venues.id, locked.map((venue) => venue.id)));
      return {
        ok: true as const,
        changedSlugs: locked.map((venue) => venue.slug),
      };
    }

    const patch: Record<string, boolean> = {};
    if (action === "deactivate") patch.isActive = false;
    if (action === "feature") patch.isFeatured = true;
    if (action === "unfeature") patch.isFeatured = false;

    if (entity === "artist") {
      const locked = await tx
        .select({ id: artists.id })
        .from(artists)
        .where(inArray(artists.id, ids))
        .orderBy(asc(artists.id))
        .for("update");
      if (locked.length === 0) {
        return { ok: true as const, changedSlugs: [] as string[] };
      }
      const result = await tx
        .update(artists)
        .set({ ...patch, updatedAt: new Date() })
        .where(inArray(artists.id, locked.map(({ id }) => id)))
        .returning({ id: artists.id, slug: artists.slug });
      return {
        ok: true as const,
        changedSlugs: result.map((artist) => artist.slug),
      };
    }

    const locked = await tx
      .select({ id: venues.id })
      .from(venues)
      .where(inArray(venues.id, ids))
      .orderBy(asc(venues.id))
      .for("update");
    if (locked.length === 0) {
      return { ok: true as const, changedSlugs: [] as string[] };
    }
    const result = await tx
      .update(venues)
      .set({ ...patch, updatedAt: new Date() })
      .where(inArray(venues.id, locked.map(({ id }) => id)))
      .returning({ id: venues.id, slug: venues.slug });
    return {
      ok: true as const,
      changedSlugs: result.map((venue) => venue.slug),
    };
  });

  if (!mutation.ok) {
    return NextResponse.json(
      { error: mutation.error },
      { status: mutation.status },
    );
  }
  const changedSlugs = mutation.changedSlugs;
  const affected = changedSlugs.length;

  // Cache invalidation is deliberately post-commit. Every supported bulk
  // mutation can change public eligibility, ordering or featured cards.
  if (changedSlugs.length > 0) {
    revalidateVendorCatalog(entity, {
      profileSlugs: changedSlugs,
      directory: true,
      homepage: true,
      services: true,
    });
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
