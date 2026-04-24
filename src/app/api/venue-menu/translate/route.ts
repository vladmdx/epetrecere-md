// Batch-translate all Romanian-only menu fields to Russian + English.
//
// Targets:
//   venue_menu_categories.nameRo  → nameRu, nameEn
//   venue_menu_items.nameRo       → nameRu, nameEn
//   venue_menu_packages.nameRo    → nameRu, nameEn
//
// By default only rows where either nameRu OR nameEn is null get updated,
// so re-running is idempotent. Pass { overwrite: true } to retranslate all.
// The work is a single Claude call (chunked at ~300 strings if needed).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  venues,
  venueMenuCategories,
  venueMenuItems,
  venueMenuPackages,
} from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { translateMenuStrings } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  venueId: z.number().int().positive(),
  /** If true, translate every row (not just rows with null RU/EN). */
  overwrite: z.boolean().default(false),
});

const CHUNK_SIZE = 300;

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`menu-translate:${ip}`, 3, 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "Prea multe cereri de traducere" },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";
  if (!isAdmin) {
    const [venue] = await db
      .select({ userId: venues.userId })
      .from(venues)
      .where(eq(venues.id, parsed.data.venueId))
      .limit(1);
    if (!venue || venue.userId !== appUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { venueId, overwrite } = parsed.data;

  // ─── Gather candidate rows ───────────────────────────────
  // We load all categories for this venue, all items belonging to those
  // categories, and all packages. Then we filter by the overwrite flag.
  const categories = await db
    .select({
      id: venueMenuCategories.id,
      nameRo: venueMenuCategories.nameRo,
      nameRu: venueMenuCategories.nameRu,
      nameEn: venueMenuCategories.nameEn,
    })
    .from(venueMenuCategories)
    .where(
      overwrite
        ? eq(venueMenuCategories.venueId, venueId)
        : // Only rows needing work
          // (nameRu IS NULL OR nameEn IS NULL) AND venue_id = X
          // Drizzle AND-combines implicitly when you pass multiple wheres
          // via the fluent API, but a single .where() with `or()` is cleanest.
          // We intersect with venueId at the outer level below.
          eq(venueMenuCategories.venueId, venueId),
    );

  const categoryIds = categories.map((c) => c.id);

  const items =
    categoryIds.length > 0
      ? await db
          .select({
            id: venueMenuItems.id,
            nameRo: venueMenuItems.nameRo,
            nameRu: venueMenuItems.nameRu,
            nameEn: venueMenuItems.nameEn,
          })
          .from(venueMenuItems)
          .where(inArray(venueMenuItems.categoryId, categoryIds))
      : [];

  const packages = await db
    .select({
      id: venueMenuPackages.id,
      nameRo: venueMenuPackages.nameRo,
      nameRu: venueMenuPackages.nameRu,
      nameEn: venueMenuPackages.nameEn,
    })
    .from(venueMenuPackages)
    .where(eq(venueMenuPackages.venueId, venueId));

  // Filter rows that actually need work.
  const needsWork = (r: { nameRu: string | null; nameEn: string | null }) =>
    overwrite || !r.nameRu || !r.nameEn;

  const catRows = categories.filter(needsWork);
  const itemRows = items.filter(needsWork);
  const pkgRows = packages.filter(needsWork);

  const allStrings = [
    ...catRows.map((r) => r.nameRo),
    ...itemRows.map((r) => r.nameRo),
    ...pkgRows.map((r) => r.nameRo),
  ];

  if (allStrings.length === 0) {
    return NextResponse.json({
      success: true,
      translated: 0,
      message: "Tot meniul are deja traduceri",
    });
  }

  // Chunk to stay under the model's output budget. 300 short strings → ~3k
  // tokens out, safe under our 4k max_tokens.
  const ruResults: string[] = [];
  const enResults: string[] = [];
  for (let i = 0; i < allStrings.length; i += CHUNK_SIZE) {
    const chunk = allStrings.slice(i, i + CHUNK_SIZE);
    try {
      const { ru, en } = await translateMenuStrings(chunk);
      ruResults.push(...ru);
      enResults.push(...en);
    } catch (err) {
      console.error("[menu-translate] chunk failed", err);
      return NextResponse.json(
        { error: "Serviciul AI a eșuat" },
        { status: 503 },
      );
    }
  }

  // Defensive: if the AI returned a different count than we asked for,
  // pad/trim to the expected length so writes don't skip rows or overflow.
  while (ruResults.length < allStrings.length) ruResults.push("");
  while (enResults.length < allStrings.length) enResults.push("");

  // ─── Apply updates ──────────────────────────────────────
  // We update all three tables in parallel; each is a small number of
  // SET-per-row updates. Persistence cost is amortized by the single AI call.
  let cursor = 0;
  const catUpdates: Array<Promise<unknown>> = [];
  for (const c of catRows) {
    const ru = ruResults[cursor] || c.nameRo;
    const en = enResults[cursor] || c.nameRo;
    cursor++;
    catUpdates.push(
      db
        .update(venueMenuCategories)
        .set({ nameRu: ru, nameEn: en })
        .where(eq(venueMenuCategories.id, c.id)),
    );
  }
  const itemUpdates: Array<Promise<unknown>> = [];
  for (const it of itemRows) {
    const ru = ruResults[cursor] || it.nameRo;
    const en = enResults[cursor] || it.nameRo;
    cursor++;
    itemUpdates.push(
      db
        .update(venueMenuItems)
        .set({ nameRu: ru, nameEn: en })
        .where(eq(venueMenuItems.id, it.id)),
    );
  }
  const pkgUpdates: Array<Promise<unknown>> = [];
  for (const p of pkgRows) {
    const ru = ruResults[cursor] || p.nameRo;
    const en = enResults[cursor] || p.nameRo;
    cursor++;
    pkgUpdates.push(
      db
        .update(venueMenuPackages)
        .set({ nameRu: ru, nameEn: en })
        .where(eq(venueMenuPackages.id, p.id)),
    );
  }

  await Promise.all([...catUpdates, ...itemUpdates, ...pkgUpdates]);

  return NextResponse.json({
    success: true,
    translated: allStrings.length,
    categories: catRows.length,
    items: itemRows.length,
    packages: pkgRows.length,
  });
}
