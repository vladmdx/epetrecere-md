// GET /api/admin/duplicates?entity=artist|venue
//
// Returns groups of records that look like duplicates so the admin can
// review and merge / dismiss. Signals we currently combine:
//
//  1. Normalized name collision — lowercase + diacritic-stripped name
//     matches exactly across multiple rows.
//  2. Phone collision — same phone number (normalized digits-only) on
//     multiple rows.
//  3. City + near-name — same city AND Levenshtein distance between
//     normalized names ≤ 3.
//
// Each group gets a stable `key` and a list of row ids + `reasons`. The
// admin page renders one card per group. We cap at 50 groups per entity
// to keep the response small; usually you'll have < 5 in a healthy DB.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { artists, venues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

const querySchema = z.object({
  entity: z.enum(["artist", "venue"]),
});

/** Strip diacritics, lowercase, collapse whitespace. */
function normalizeName(s: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Digits only. Strips +, -, spaces, parentheses. */
function normalizePhone(s: string | null): string {
  if (!s) return "";
  return s.replace(/\D/g, "");
}

/** Standard iterative Levenshtein distance. O(m*n) — fine for names < 80 chars. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  // Two-row buffer rotation to avoid allocating a full m*n matrix.
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

type Row = {
  id: number;
  name: string | null;
  phone: string | null;
  city: string | null;
  slug: string;
  normalizedName: string;
  normalizedPhone: string;
};

type DuplicateGroup = {
  key: string;
  reasons: string[];
  rows: Array<{
    id: number;
    name: string;
    phone: string | null;
    city: string | null;
    slug: string;
  }>;
};

function buildGroups(rows: Row[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();

  function addTo(key: string, reason: string, ids: number[]) {
    // Canonicalize key ordering so "a|b" and "b|a" collapse.
    const sortedIds = [...new Set(ids)].sort((a, b) => a - b);
    const canonicalKey = `${key}:${sortedIds.join(",")}`;
    if (sortedIds.length < 2) return;
    const existing = groups.get(canonicalKey);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    groups.set(canonicalKey, {
      key: canonicalKey,
      reasons: [reason],
      rows: sortedIds
        .map((id) => rowMap.get(id))
        .filter((r): r is Row => !!r)
        .map((r) => ({
          id: r.id,
          name: r.name ?? "",
          phone: r.phone,
          city: r.city,
          slug: r.slug,
        })),
    });
  }

  // 1. Same normalized name
  const byName = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.normalizedName) continue;
    const ids = byName.get(r.normalizedName) ?? [];
    ids.push(r.id);
    byName.set(r.normalizedName, ids);
  }
  for (const [name, ids] of byName.entries()) {
    if (ids.length >= 2) addTo(`name:${name}`, "Nume identic", ids);
  }

  // 2. Same phone
  const byPhone = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.normalizedPhone || r.normalizedPhone.length < 7) continue;
    const ids = byPhone.get(r.normalizedPhone) ?? [];
    ids.push(r.id);
    byPhone.set(r.normalizedPhone, ids);
  }
  for (const [phone, ids] of byPhone.entries()) {
    if (ids.length >= 2) addTo(`phone:${phone}`, "Același telefon", ids);
  }

  // 3. Same city + Levenshtein ≤ 3. O(n²) within each city bucket.
  const byCity = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.city) continue;
    const key = r.city.toLowerCase().trim();
    const list = byCity.get(key) ?? [];
    list.push(r);
    byCity.set(key, list);
  }
  for (const [, cityRows] of byCity.entries()) {
    if (cityRows.length < 2) continue;
    // Skip massive city buckets (e.g. Chișinău has too many rows to quadratic over)
    if (cityRows.length > 200) continue;
    for (let i = 0; i < cityRows.length; i++) {
      for (let j = i + 1; j < cityRows.length; j++) {
        const a = cityRows[i];
        const b = cityRows[j];
        if (!a.normalizedName || !b.normalizedName) continue;
        if (a.normalizedName === b.normalizedName) continue; // already caught above
        const dist = levenshtein(a.normalizedName, b.normalizedName);
        const maxLen = Math.max(a.normalizedName.length, b.normalizedName.length);
        // Threshold scales with length: short names need stricter match.
        const threshold = maxLen <= 10 ? 2 : 3;
        if (dist <= threshold) {
          addTo(
            `near:${a.id}-${b.id}`,
            `Oraș identic + nume similar (${dist} caractere)`,
            [a.id, b.id],
          );
        }
      }
    }
  }

  // Newest/biggest reasons first
  return Array.from(groups.values())
    .sort((a, b) => b.reasons.length - a.reasons.length || b.rows.length - a.rows.length)
    .slice(0, 50);
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const parsed = querySchema.safeParse({
    entity: req.nextUrl.searchParams.get("entity"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "entity required" }, { status: 400 });
  }

  let raw: Row[] = [];
  if (parsed.data.entity === "artist") {
    const rows = await db
      .select({
        id: artists.id,
        name: artists.nameRo,
        phone: artists.phone,
        city: artists.location,
        slug: artists.slug,
      })
      .from(artists)
      .where(eq(artists.isActive, true));
    raw = rows.map((r) => ({
      ...r,
      normalizedName: normalizeName(r.name),
      normalizedPhone: normalizePhone(r.phone),
    }));
  } else {
    const rows = await db
      .select({
        id: venues.id,
        name: venues.nameRo,
        phone: venues.phone,
        city: venues.city,
        slug: venues.slug,
      })
      .from(venues)
      .where(eq(venues.isActive, true));
    raw = rows.map((r) => ({
      ...r,
      normalizedName: normalizeName(r.name),
      normalizedPhone: normalizePhone(r.phone),
    }));
  }

  const groups = buildGroups(raw);
  return NextResponse.json({
    entity: parsed.data.entity,
    total: raw.length,
    groups,
  });
}
