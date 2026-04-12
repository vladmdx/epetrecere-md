import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE, CLIENT_STATE } from "../helpers/paths";
import { getTestUsers } from "../helpers/db";

// M-SEC — Admin layout auth gate.
//
// Before this pass, `src/app/(admin)/admin/layout.tsx` rendered the
// admin shell for anyone — no role check, no redirect. The underlying
// CRUD endpoints were gated one-by-one, but the read-only admin pages
// could still leak data. The fix: run `requireAdmin()` at the layout
// boundary and redirect non-admins before any child page renders.
//
// Auth matrix verified here:
//
//   anonymous       → 307 → /sign-in?redirect_url=/admin
//   signed-in artist → 307 → /
//   signed-in user   → 307 → /
//
// The two test personas are seeded as role='artist' and role='user',
// so both are non-admin and should bounce to home. We don't seed a
// super_admin persona — that would require a separate Clerk account
// and is out of scope. A smoke test that an admin CAN access `/admin`
// would land there if we ever add one.

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe("admin layout auth gate (M-SEC)", () => {
  test("anonymous GET /admin → 307 → /sign-in", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      // maxRedirects: 0 so we can inspect the Location header ourselves.
      extraHTTPHeaders: {},
    });
    const res = await req.get("/admin", { maxRedirects: 0 });
    expect([307, 308, 302]).toContain(res.status());
    const loc = res.headers()["location"] ?? "";
    expect(loc).toContain("/sign-in");
    expect(loc).toContain("redirect_url");
  });

  test("signed-in non-admin (Igor/artist) GET /admin → 307 → /", async () => {
    // Sanity: confirm Igor is not an admin in the DB so the assertion
    // below actually exercises the 403 branch of requireAdmin().
    const { igor } = await getTestUsers();
    expect(igor.role).not.toBe("admin");
    expect(igor.role).not.toBe("super_admin");

    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.get("/admin", { maxRedirects: 0 });
    expect([307, 308, 302]).toContain(res.status());
    const loc = res.headers()["location"] ?? "";
    // Expect a bounce to home — not a 403 page, not the sign-in prompt.
    expect(loc).not.toContain("/sign-in");
    expect(loc).toMatch(/^\/?$|\/$/);
  });

  test("signed-in client (role=user) GET /admin → 307 → /", async () => {
    const { client } = await getTestUsers();
    expect(client.role).not.toBe("admin");
    expect(client.role).not.toBe("super_admin");

    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.get("/admin", { maxRedirects: 0 });
    expect([307, 308, 302]).toContain(res.status());
    const loc = res.headers()["location"] ?? "";
    expect(loc).not.toContain("/sign-in");
    expect(loc).toMatch(/^\/?$|\/$/);
  });

  test("anonymous GET /admin/artisti → 307 → /sign-in (nested route also gated)", async () => {
    // Ensure the gate applies to every page under /admin, not just the
    // index. Pick an arbitrary nested admin route.
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.get("/admin/artisti", { maxRedirects: 0 });
    expect([307, 308, 302]).toContain(res.status());
    const loc = res.headers()["location"] ?? "";
    expect(loc).toContain("/sign-in");
  });
});
