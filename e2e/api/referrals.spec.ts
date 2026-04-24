// Referral program (TIER 4) — code generation, capture, trigger.

import fs from "node:fs";
import { test, expect, request } from "@playwright/test";
import { sql, getTestUsers } from "../helpers/db";
import { CLIENT_STATE } from "../helpers/paths";
import { isSessionLive } from "../helpers/session-health";

const clientStateExists = fs.existsSync(CLIENT_STATE);

test.describe("Referrals", () => {
  test("anonymous GET /api/me/referral → 401", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.fetch("/api/me/referral");
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test("anonymous POST /api/referrals/capture → 401", async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const res = await ctx.post("/api/referrals/capture", {
      data: { code: "someone-1234" },
    });
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

    test("first GET lazily mints a referral code + shareUrl", async ({
      request: req,
    }) => {
      const { client } = await getTestUsers();
      // Clear any pre-seeded code so the lazy-mint path actually runs
      await sql`UPDATE users SET referral_code = NULL WHERE id = ${client.id}`;

      const res = await req.get("/api/me/referral");
      expect(res.status()).toBe(200);
      const body = await res.json();

      expect(body.code).toMatch(/^[a-z0-9]+-[a-z0-9]{4}$/);
      expect(body.shareUrl).toContain(`?ref=${body.code}`);
      expect(body.creditCents).toBe(0);
      expect(Array.isArray(body.referred)).toBe(true);

      // DB verification
      const [row] = (await sql`
        SELECT referral_code FROM users WHERE id = ${client.id}
      `) as Array<{ referral_code: string }>;
      expect(row.referral_code).toBe(body.code);
    });

    test("self-referral is rejected (400)", async ({ request: req }) => {
      const meRes = await req.get("/api/me/referral");
      const { code } = await meRes.json();

      const res = await req.post("/api/referrals/capture", {
        data: { code },
      });
      expect(res.status()).toBe(400);
    });

    test("capture with unknown code → 404", async ({ request: req }) => {
      const res = await req.post("/api/referrals/capture", {
        data: { code: "no-such-code-xyz" },
      });
      expect(res.status()).toBe(404);
    });

    test("capture with invalid shape → 400", async ({ request: req }) => {
      const res = await req.post("/api/referrals/capture", {
        data: { notAField: true },
      });
      expect(res.status()).toBe(400);
    });
  });
});
