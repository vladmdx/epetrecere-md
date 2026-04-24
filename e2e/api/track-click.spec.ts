// Public click-tracking beacon tests (spec 9.1).
//
// `/api/analytics/track-click` is the public endpoint fired from the
// venue/artist detail pages when a user clicks CTA / phone / gallery /
// menu / contact. It must:
//   - accept anonymous POSTs (fire-and-forget, no auth)
//   - validate the payload (enum clickType)
//   - dedupe within 2 minutes per (session hash, clickType, target)

import { test, expect, request } from "@playwright/test";
import { sql } from "../helpers/db";

async function getOwnedVenueId(): Promise<number> {
  const [v] = (await sql`
    SELECT id FROM venues WHERE is_active = true LIMIT 1
  `) as Array<{ id: number }>;
  return v.id;
}

test.describe("Track-click beacon", () => {
  test("valid payload → 200 + profile_clicks row", async ({ baseURL }) => {
    const venueId = await getOwnedVenueId();
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });

    // Cleanup any stale test clicks first
    await sql`DELETE FROM profile_clicks WHERE venue_id = ${venueId}`;

    const res = await ctx.post("/api/analytics/track-click", {
      data: { kind: "venue", id: venueId, clickType: "cta" },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    // Small grace period for async DB insert — beacon is fire-and-forget.
    await new Promise((r) => setTimeout(r, 500));
    const rows = (await sql`
      SELECT click_type FROM profile_clicks
      WHERE venue_id = ${venueId}
        AND created_at > NOW() - INTERVAL '10 seconds'
    `) as Array<{ click_type: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].click_type).toBe("cta");

    // Cleanup
    await sql`DELETE FROM profile_clicks WHERE venue_id = ${venueId}`;
    await ctx.dispose();
  });

  test("second identical click within 2min → deduped", async ({ baseURL }) => {
    const venueId = await getOwnedVenueId();
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    await sql`DELETE FROM profile_clicks WHERE venue_id = ${venueId}`;

    const body = { kind: "venue", id: venueId, clickType: "gallery" };
    const first = await ctx.post("/api/analytics/track-click", { data: body });
    expect(first.status()).toBe(200);

    const second = await ctx.post("/api/analytics/track-click", { data: body });
    expect(second.status()).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, deduped: true });

    await new Promise((r) => setTimeout(r, 300));
    const [count] = (await sql`
      SELECT COUNT(*)::int AS n FROM profile_clicks
      WHERE venue_id = ${venueId} AND click_type = 'gallery'
    `) as Array<{ n: number }>;
    expect(count.n).toBe(1);

    await sql`DELETE FROM profile_clicks WHERE venue_id = ${venueId}`;
    await ctx.dispose();
  });

  test("different clickType on same session → NOT deduped", async ({
    baseURL,
  }) => {
    const venueId = await getOwnedVenueId();
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    await sql`DELETE FROM profile_clicks WHERE venue_id = ${venueId}`;

    await ctx.post("/api/analytics/track-click", {
      data: { kind: "venue", id: venueId, clickType: "cta" },
    });
    await ctx.post("/api/analytics/track-click", {
      data: { kind: "venue", id: venueId, clickType: "menu" },
    });

    await new Promise((r) => setTimeout(r, 300));
    const rows = (await sql`
      SELECT click_type FROM profile_clicks
      WHERE venue_id = ${venueId}
      ORDER BY click_type
    `) as Array<{ click_type: string }>;
    expect(rows.map((r) => r.click_type)).toEqual(["cta", "menu"]);

    await sql`DELETE FROM profile_clicks WHERE venue_id = ${venueId}`;
    await ctx.dispose();
  });

  test("invalid clickType → 400", async ({ baseURL }) => {
    const venueId = await getOwnedVenueId();
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/analytics/track-click", {
      data: { kind: "venue", id: venueId, clickType: "bogus" },
    });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test("missing target id → 400", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/analytics/track-click", {
      data: { kind: "venue", clickType: "cta" },
    });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });
});
