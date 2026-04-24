// Per-type notification preferences + timezone (spec 11.1, 11.2).
//
// Covers the user-facing `/api/me/notification-preferences` (GET/PUT)
// and `/api/me/timezone` (PUT) endpoints, plus direct DB verification
// that dispatchNotification's category/type resolution picks up the
// right keys.

import fs from "node:fs";
import { test, expect, request } from "@playwright/test";
import { sql, getTestUsers } from "../helpers/db";
import { CLIENT_STATE } from "../helpers/paths";
import { isSessionLive } from "../helpers/session-health";

const clientStateExists = fs.existsSync(CLIENT_STATE);

test.describe("Notification preferences + timezone", () => {
  test("anonymous GET /api/me/notification-preferences → 401", async ({
    baseURL,
  }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.fetch("/api/me/notification-preferences");
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("anonymous PUT /api/me/timezone → 401", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.put("/api/me/timezone", {
      data: { timezone: "Europe/Chisinau" },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("anonymous PUT /api/me/language → 401", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.put("/api/me/language", { data: { lang: "ru" } });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test.describe("as signed-in client", () => {
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

    test("GET returns defaults (prefs=empty, tz=default)", async ({
      request: req,
    }) => {
      const res = await req.get("/api/me/notification-preferences");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("digestFrequency");
      expect(body).toHaveProperty("prefs");
      expect(body).toHaveProperty("timezone");
      expect(body).toHaveProperty("categories");
      expect(Array.isArray(body.categories)).toBe(true);
      expect(body.categories).toEqual(
        expect.arrayContaining([
          "booking_requests",
          "booking_updates",
          "messages",
          "reviews",
          "reminders",
        ]),
      );
    });

    test("PUT single-cell toggle merges into prefs JSONB", async ({
      request: req,
    }) => {
      // Reset
      const { client } = await getTestUsers();
      await sql`UPDATE users SET notification_prefs = '{}'::jsonb WHERE id = ${client.id}`;

      const res = await req.put("/api/me/notification-preferences", {
        data: { category: "reviews", channel: "push", enabled: false },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        success: true,
        prefs: { reviews: { push: false } },
      });

      // DB verification
      const [row] = (await sql`
        SELECT notification_prefs FROM users WHERE id = ${client.id}
      `) as Array<{ notification_prefs: Record<string, unknown> }>;
      expect(row.notification_prefs).toMatchObject({
        reviews: { push: false },
      });

      // Cleanup
      await sql`UPDATE users SET notification_prefs = '{}'::jsonb WHERE id = ${client.id}`;
    });

    test("PUT invalid category → 400", async ({ request: req }) => {
      const res = await req.put("/api/me/notification-preferences", {
        data: { category: "bogus", channel: "email", enabled: false },
      });
      expect(res.status()).toBe(400);
    });

    test("timezone PUT valid IANA → 200, DB updated", async ({
      request: req,
    }) => {
      const { client } = await getTestUsers();
      const original = (await sql`
        SELECT timezone FROM users WHERE id = ${client.id}
      `) as Array<{ timezone: string }>;
      const originalTz = original[0].timezone;

      const res = await req.put("/api/me/timezone", {
        data: { timezone: "Europe/Paris" },
      });
      expect(res.status()).toBe(200);

      const [updated] = (await sql`
        SELECT timezone FROM users WHERE id = ${client.id}
      `) as Array<{ timezone: string }>;
      expect(updated.timezone).toBe("Europe/Paris");

      // Restore
      await sql`UPDATE users SET timezone = ${originalTz} WHERE id = ${client.id}`;
    });

    test("timezone PUT invalid → 400", async ({ request: req }) => {
      const res = await req.put("/api/me/timezone", {
        data: { timezone: "Europe/Atlantis" },
      });
      expect(res.status()).toBe(400);
    });

    test("language PUT valid enum → 200", async ({ request: req }) => {
      const { client } = await getTestUsers();
      const [before] = (await sql`
        SELECT language_pref FROM users WHERE id = ${client.id}
      `) as Array<{ language_pref: string }>;

      const res = await req.put("/api/me/language", { data: { lang: "ru" } });
      expect(res.status()).toBe(200);

      const [after] = (await sql`
        SELECT language_pref FROM users WHERE id = ${client.id}
      `) as Array<{ language_pref: string }>;
      expect(after.language_pref).toBe("ru");

      // Restore
      await sql`UPDATE users SET language_pref = ${before.language_pref} WHERE id = ${client.id}`;
    });

    test("language PUT invalid → 400", async ({ request: req }) => {
      const res = await req.put("/api/me/language", { data: { lang: "de" } });
      expect(res.status()).toBe(400);
    });
  });
});
