import { test, expect, request as pwRequest } from "@playwright/test";
import { CLIENT_STATE } from "../helpers/paths";
import { sql, getTestUsers } from "../helpers/db";

// F-S1..F-S5 / M12 — Venue owner happy-path.
//
// The venue auth spec (venue-auth.spec.ts) fences the negative cases;
// this one drives the full owner journey end-to-end against the real
// API, exercising the fields that each F-S sub-feature adds:
//
//   F-S1  POST /api/auth/register-venue                   — onboarding
//   F-S2  PUT  /api/venues/[id]  { capacityMin/Max, pricePerPerson }
//   F-S3  PUT  /api/venues/[id]  { facilities: [...] }
//   F-S4  PUT  /api/venues/[id]  { menuUrl }
//   F-S5  PUT  /api/venues/[id]  { virtualTourUrl }
//         GET  /api/me/venue                              — round-trip read
//
// Persona: the client test user. They don't own an artist row, so the
// existing fixture can be reused without colliding with Igor.
//
// Re-runnability: register-venue enforces one-venue-per-user and returns
// 409 on a second call. The beforeAll deletes any prior venue the client
// owns (plus admin notifications linked to it), so the suite can run in a
// loop without accumulating rows.

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe.serial("venue owner round-trip (F-S1..F-S5)", () => {
  let venueId: number;

  test.beforeAll(async () => {
    const { client } = await getTestUsers();

    // Wipe any leftover venue + notifications pointing at it so the
    // onboarding POST starts from a clean slate.
    const existing = await sql`
      select id from venues where user_id = ${client.id}
    `;
    for (const row of existing) {
      const vid = row.id as number;
      await sql`
        delete from notifications
        where action_url = ${"/admin/sali/" + vid}
      `;
      await sql`delete from venue_images where venue_id = ${vid}`;
      await sql`delete from venues where id = ${vid}`;
    }
  });

  test.afterAll(async () => {
    if (venueId !== undefined) {
      await sql`
        delete from notifications
        where action_url = ${"/admin/sali/" + venueId}
      `;
      await sql`delete from venue_images where venue_id = ${venueId}`;
      await sql`delete from venues where id = ${venueId}`;
    }
  });

  test("F-S1: POST /api/auth/register-venue creates an inactive venue", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.post("/api/auth/register-venue", {
      data: {
        name: "E2E Round-Trip Venue",
        phone: "+37360999111",
        city: "Chișinău",
        address: "str. Testare 1",
      },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(typeof json.venueId).toBe("number");
    venueId = json.venueId as number;

    // Inactive by default — venues go through admin approval.
    const [row] = await sql`
      select is_active from venues where id = ${venueId}
    `;
    expect(row.is_active).toBe(false);
  });

  test("F-S2/F-S3/F-S4/F-S5: PUT /api/venues/[id] updates all profile fields", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const payload = {
      // F-S2 — capacity + price/person
      capacityMin: 50,
      capacityMax: 200,
      pricePerPerson: 450,
      // F-S3 — facilities list
      facilities: ["parking", "ac", "stage", "kitchen"],
      // F-S4 — menu link
      menuUrl: "https://example.com/menu.pdf",
      // F-S5 — virtual tour embed
      virtualTourUrl: "https://example.com/tour",
      // Description update to prove multilingual text columns also persist
      descriptionRo: "Sală de test pentru e2e round-trip.",
    };
    const res = await req.put(`/api/venues/${venueId}`, { data: payload });
    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.capacityMin).toBe(50);
    expect(updated.capacityMax).toBe(200);
    expect(updated.pricePerPerson).toBe(450);
    expect(updated.facilities).toEqual(["parking", "ac", "stage", "kitchen"]);
    expect(updated.menuUrl).toBe("https://example.com/menu.pdf");
    expect(updated.virtualTourUrl).toBe("https://example.com/tour");
    expect(updated.descriptionRo).toBe("Sală de test pentru e2e round-trip.");
  });

  test("GET /api/me/venue reflects the PUT and returns the owner's venue", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.get("/api/me/venue");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.venue).not.toBeNull();
    expect(json.venue.id).toBe(venueId);
    expect(json.venue.capacityMin).toBe(50);
    expect(json.venue.capacityMax).toBe(200);
    expect(json.venue.pricePerPerson).toBe(450);
    expect(json.venue.facilities).toEqual(["parking", "ac", "stage", "kitchen"]);
    expect(json.venue.menuUrl).toBe("https://example.com/menu.pdf");
    expect(json.venue.virtualTourUrl).toBe("https://example.com/tour");
    // Images join returns an array even when empty.
    expect(Array.isArray(json.venue.images)).toBe(true);
  });

  test("GET /api/me/venue/stats returns the 5-field stat object for the owner", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.get("/api/me/venue/stats");
    expect(res.status()).toBe(200);
    const json = await res.json();
    // A freshly-registered venue has no bookings or views yet — all
    // counters should be zero, rating nullable.
    expect(json.stats).not.toBeNull();
    expect(json.stats.pendingBookings).toBe(0);
    expect(json.stats.profileViews30d).toBe(0);
    expect(json.stats.bookingsThisMonth).toBe(0);
    expect(json.stats.ratingCount).toBe(0);
  });

  test("POST /api/auth/register-venue a second time → 409 (one-per-user rule)", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.post("/api/auth/register-venue", {
      data: { name: "Second Venue Attempt", phone: "+37360000002" },
    });
    expect(res.status()).toBe(409);
    const json = await res.json();
    expect(json.venueId).toBe(venueId);
  });
});
