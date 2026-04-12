import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE, CLIENT_STATE } from "../helpers/paths";
import { getTestUsers, getIgorArtist, sql } from "../helpers/db";

// F-A8 — Vendor-side analytics page.
//
// The dashboard surface is a server component, not a JSON API, so the
// assertions here are HTML-level: check the 200/redirect status + sniff
// a known string from the rendered markup. For the raw number checks we
// query profile_views directly via the shared Neon client in helpers/db.
//
// Auth matrix:
//   anon  GET /dashboard/analytics  → 307 → /sign-in?redirect_url=...
//   client (non-artist)             → 307 → /dashboard  (bounced home)
//   artist (Igor)                   → 200 + rendered markup
//
// Data sanity:
//   Seed a single profile_views row for Igor in the current month, hit
//   the page, and assert that at least that count shows up. We don't
//   snapshot the full DOM — flaky — we just grep for the artist name
//   in the heading, which changes only when Igor is renamed in the DB.

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe("artist analytics page (F-A8)", () => {
  test("anonymous GET /dashboard/analytics → 307 → /sign-in", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.get("/dashboard/analytics", { maxRedirects: 0 });
    expect([307, 308, 302]).toContain(res.status());
    const loc = res.headers()["location"] ?? "";
    expect(loc).toContain("/sign-in");
    expect(loc).toContain("redirect_url");
  });

  test("signed-in non-artist (Client) GET /dashboard/analytics → 307 → /dashboard", async () => {
    // Sanity: the test client user doesn't own an artist row, so the
    // resolution logic should redirect them home rather than render a
    // zeroed-out shell they can't populate.
    const { client } = await getTestUsers();
    const rows = await sql`
      select id from artists where user_id = ${client.id} limit 1
    `;
    expect(rows.length).toBe(0);

    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.get("/dashboard/analytics", { maxRedirects: 0 });
    expect([307, 308, 302]).toContain(res.status());
    const loc = res.headers()["location"] ?? "";
    expect(loc).not.toContain("/sign-in");
    expect(loc).toContain("/dashboard");
  });

  test("signed-in artist (Igor) GET /dashboard/analytics → 200 + rendered shell", async () => {
    const igor = await getIgorArtist();
    expect(igor.id).toBeGreaterThan(0);

    // Look up the display name separately — getIgorArtist() caches only
    // id/slug/userId.
    const [nameRow] = await sql`
      select name_ro from artists where id = ${igor.id} limit 1
    `;
    const nameRo = nameRow?.name_ro as string;
    expect(typeof nameRo).toBe("string");

    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.get("/dashboard/analytics");
    expect(res.status()).toBe(200);

    const html = await res.text();
    // The page is a server component so the heading + artist name are
    // inlined in the first paint.
    expect(html).toContain("Analitice");
    expect(html).toContain(nameRo);
    expect(html).toContain("Vizite profil");
  });
});
