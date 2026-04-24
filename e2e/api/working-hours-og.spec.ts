// Working hours structured field + OG image selector (spec 4.2, 4.7).

import { test, expect, request } from "@playwright/test";
import { sql } from "../helpers/db";

const SAMPLE_HOURS = {
  mon: { open: "10:00", close: "22:00" },
  tue: { open: "10:00", close: "22:00" },
  wed: { open: "10:00", close: "22:00" },
  thu: { open: "10:00", close: "22:00" },
  fri: { open: "10:00", close: "22:00" },
  sat: { open: "10:00", close: "24:00" },
  sun: { open: "10:00", close: "24:00" },
};

test.describe("Working hours + OG image", () => {
  test("working_hours JSONB persists round-trip via DB", async () => {
    const [v] = (await sql`
      SELECT id, working_hours FROM venues WHERE is_active = true LIMIT 1
    `) as Array<{ id: number; working_hours: unknown }>;
    const original = v.working_hours;

    try {
      await sql`
        UPDATE venues SET working_hours = ${JSON.stringify(SAMPLE_HOURS)}::jsonb
        WHERE id = ${v.id}
      `;
      const [after] = (await sql`
        SELECT working_hours FROM venues WHERE id = ${v.id}
      `) as Array<{ working_hours: typeof SAMPLE_HOURS }>;
      expect(after.working_hours).toMatchObject(SAMPLE_HOURS);
      expect(after.working_hours.mon).toMatchObject({
        open: "10:00",
        close: "22:00",
      });
    } finally {
      await sql`
        UPDATE venues SET working_hours = ${original ? JSON.stringify(original) : null}::jsonb
        WHERE id = ${v.id}
      `;
    }
  });

  test("public venue page renders working hours when set", async ({
    baseURL,
  }) => {
    const [v] = (await sql`
      SELECT id, slug FROM venues
      WHERE is_active = true AND images_count_hint IS NOT DISTINCT FROM NULL
      LIMIT 1
    `.catch(async () => {
      // Fallback if the hint column doesn't exist in this env
      return await sql`
        SELECT id, slug FROM venues WHERE is_active = true LIMIT 1
      `;
    })) as Array<{ id: number; slug: string }>;
    if (!v) test.skip(true, "No active venue for working-hours render test");

    const originalRow = (await sql`
      SELECT working_hours FROM venues WHERE id = ${v.id}
    `) as Array<{ working_hours: unknown }>;
    const original = originalRow[0].working_hours;

    try {
      await sql`
        UPDATE venues SET working_hours = ${JSON.stringify(SAMPLE_HOURS)}::jsonb
        WHERE id = ${v.id}
      `;

      const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
      const res = await ctx.fetch(`/sali/${v.slug}`);
      expect(res.status()).toBe(200);
      const html = await res.text();
      // formatWorkingHours collapses Mon-Fri (same hours) into a range.
      expect(html).toContain("Lu-Vi 10:00-22:00");
      expect(html).toContain("Sâ-Du 10:00-24:00");
      await ctx.dispose();
    } finally {
      await sql`
        UPDATE venues SET working_hours = ${original ? JSON.stringify(original) : null}::jsonb
        WHERE id = ${v.id}
      `;
    }
  });

  test("og_image_url column is optional + persists when set", async () => {
    const [v] = (await sql`
      SELECT id, og_image_url FROM venues WHERE is_active = true LIMIT 1
    `) as Array<{ id: number; og_image_url: string | null }>;
    const original = v.og_image_url;

    try {
      const testUrl = "https://example.com/og-e2e-test.jpg";
      await sql`UPDATE venues SET og_image_url = ${testUrl} WHERE id = ${v.id}`;
      const [after] = (await sql`
        SELECT og_image_url FROM venues WHERE id = ${v.id}
      `) as Array<{ og_image_url: string }>;
      expect(after.og_image_url).toBe(testUrl);
    } finally {
      await sql`UPDATE venues SET og_image_url = ${original} WHERE id = ${v.id}`;
    }
  });
});
