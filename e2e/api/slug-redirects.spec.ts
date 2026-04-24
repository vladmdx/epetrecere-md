// Slug redirect middleware tests (spec 4.7).
//
// When an owner renames their venue/artist slug, the app inserts a row
// in the `redirects` table. Middleware intercepts requests to the old
// path and returns a proper 301/308 HTTP redirect. Previously this
// relied on page-level `permanentRedirect` which was swallowed by
// Next 15 streaming + loading.tsx — fixed in commit e5796f4.

import { test, expect, request } from "@playwright/test";
import { sql } from "../helpers/db";

type SeedState = {
  originalSlug: string;
  venueId: number;
};

async function seedRename(targetSlug: string): Promise<SeedState> {
  const [v] = (await sql`
    SELECT id, slug FROM venues WHERE slug = 'test-venue-e2e' LIMIT 1
  `) as Array<{ id: number; slug: string }>;
  if (!v) throw new Error("Test venue missing — re-run seed");

  // Rename the venue to the target slug + insert the 301 row.
  await sql`UPDATE venues SET slug = ${targetSlug} WHERE id = ${v.id}`;
  await sql`
    INSERT INTO redirects (from_path, to_path, status_code)
    VALUES (${"/sali/" + v.slug}, ${"/sali/" + targetSlug}, '301')
  `;
  return { originalSlug: v.slug, venueId: v.id };
}

async function restoreSlug(state: SeedState): Promise<void> {
  await sql`UPDATE venues SET slug = ${state.originalSlug} WHERE id = ${state.venueId}`;
  await sql`
    DELETE FROM redirects
    WHERE from_path = ${"/sali/" + state.originalSlug}
  `;
}

test.describe("Slug redirects", () => {
  test("venue rename → 301 at HTTP level, not 200 with 404 content", async ({
    baseURL,
  }) => {
    const newSlug = `e2e-renamed-${Date.now().toString(36).slice(-5)}`;
    const state = await seedRename(newSlug);
    try {
      // Give the middleware cache a moment to refresh (60s TTL in prod,
      // but each test instance starts fresh so it's immediate).
      const ctx = await request.newContext({
        baseURL,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          // Bust the Edge cache by using a fresh accept-language each run.
          "Accept-Language": `ro-RO,en;q=0.9,${Date.now()}`,
        },
      });

      const res = await ctx.fetch(`/sali/${state.originalSlug}`, {
        maxRedirects: 0,
      });

      expect(res.status()).toBe(301);
      expect(res.headers()["location"]).toBe(`/sali/${newSlug}`);

      await ctx.dispose();
    } finally {
      await restoreSlug(state);
    }
  });

  test("pre-existing artist seed redirects still resolve", async ({
    baseURL,
  }) => {
    // Seed artist redirects (from initial migration on 2026-04-14).
    const rows = (await sql`
      SELECT from_path, to_path FROM redirects
      WHERE from_path LIKE '/artisti/%'
      LIMIT 1
    `) as Array<{ from_path: string; to_path: string }>;
    test.skip(rows.length === 0, "No seeded artist redirects in this DB");

    const ctx = await request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });
    const res = await ctx.fetch(rows[0].from_path, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["location"]).toBe(rows[0].to_path);
    await ctx.dispose();
  });

  test("unknown slug returns 200 (not a fake redirect)", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.fetch(
      `/sali/definitely-not-a-real-slug-${Date.now().toString(36)}`,
      { maxRedirects: 0 },
    );
    // Not 3xx — middleware should NOT redirect unknown slugs.
    expect([200, 404]).toContain(res.status());
    await ctx.dispose();
  });
});
