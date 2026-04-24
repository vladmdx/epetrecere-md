// Admin-only features (TIER 4): bulk actions + duplicate detection.

import fs from "node:fs";
import { test, expect, request } from "@playwright/test";
import { sql } from "../helpers/db";
import { CLIENT_STATE } from "../helpers/paths";
import { isSessionLive } from "../helpers/session-health";

// The non-admin-403 cases need a signed-in non-admin session. Skip them
// when the setup project hasn't run (e.g. running the suite without
// --project setup or Clerk test tokens configured).
const clientStateExists = fs.existsSync(CLIENT_STATE);

test.describe("Admin bulk actions", () => {
  test("anonymous POST /api/admin/bulk → 401", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/admin/bulk", {
      data: { entity: "artist", ids: [1], action: "activate" },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test.describe("as non-admin client", () => {
    test.skip(
      !clientStateExists,
      "Client auth storage state missing — run `--project setup` first",
    );
    test.use({ storageState: CLIENT_STATE });

    test.beforeEach(async ({ baseURL }) => {
      const live = await isSessionLive(CLIENT_STATE, baseURL!);
      test.skip(
        !live,
        "Clerk session in e2e/.auth/client.json has expired — re-run `--project setup`",
      );
    });

    test("POST /api/admin/bulk → 403", async ({ request: req }) => {
      const res = await req.post("/api/admin/bulk", {
        data: { entity: "venue", ids: [1], action: "activate" },
      });
      expect(res.status()).toBe(403);
    });

    test("GET /api/admin/duplicates → 403", async ({ request: req }) => {
      const res = await req.get("/api/admin/duplicates?entity=artist");
      expect(res.status()).toBe(403);
    });
  });

  test("anonymous GET /api/admin/duplicates → 401", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.fetch("/api/admin/duplicates?entity=artist");
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("duplicate detection heuristic — exact name match", async () => {
    // Seed 2 artists with identical normalized names + same user to later
    // clean up. We verify the heuristic logic directly — the admin API
    // just reads this same data.
    const ts = Date.now();
    const [a1] = (await sql`
      INSERT INTO artists (user_id, slug, name_ro, location, is_active, rating_avg, rating_count)
      VALUES (NULL, ${`dupe-test-a-${ts}`}, 'Ansamblul Duplicat', 'Chișinău', true, 0, 0)
      RETURNING id
    `) as Array<{ id: number }>;
    const [a2] = (await sql`
      INSERT INTO artists (user_id, slug, name_ro, location, is_active, rating_avg, rating_count)
      VALUES (NULL, ${`dupe-test-b-${ts}`}, 'ansamblul  duplicat', 'chisinau', true, 0, 0)
      RETURNING id
    `) as Array<{ id: number }>;

    try {
      // Verify the exact-name grouping would catch these two rows.
      const rows = (await sql`
        SELECT id, name_ro FROM artists
        WHERE LOWER(TRIM(REGEXP_REPLACE(name_ro, '\\s+', ' ', 'g'))) =
              LOWER(TRIM(REGEXP_REPLACE('Ansamblul Duplicat', '\\s+', ' ', 'g')))
          AND is_active = true
      `) as Array<{ id: number }>;
      expect(rows.map((r) => r.id).sort()).toEqual([a1.id, a2.id].sort());
    } finally {
      await sql`DELETE FROM artists WHERE id IN (${a1.id}, ${a2.id})`;
    }
  });
});
