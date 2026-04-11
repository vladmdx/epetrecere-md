import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE } from "../helpers/paths";
import { sql, getIgorArtist } from "../helpers/db";

// F-A4 — Profile save round-trip.
//
// The vendor profile page (`/dashboard/profil`) was previously a local mock
// where the "Salvează" button only toast-uied. This spec exercises the real
// backend contract:
//
//   1. GET  /api/me/artist      → full artist row, driving the form hydrate
//   2. PUT  /api/artists/crud   → persists every editable field
//   3. GET  /api/me/artist      → re-reads and confirms the new values
//
// At the end we restore the original values so the spec is idempotent and
// leaves Igor's profile untouched on the live DB.

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe.serial("profile save round-trip (F-A4)", () => {
  let artistId: number;
  // Snapshot of every field we're about to mutate so afterAll can restore.
  let snapshot: {
    phone: string | null;
    website: string | null;
    instagram: string | null;
    descriptionRo: string | null;
    priceFrom: number | null;
    calendarEnabled: boolean;
    bufferHours: number | null;
    autoReplyEnabled: boolean;
    autoReplyMessage: string | null;
  };

  test.beforeAll(async () => {
    const igor = await getIgorArtist();
    artistId = igor.id;

    const [row] = await sql`
      select phone, website, instagram, description_ro, price_from,
             calendar_enabled, buffer_hours,
             auto_reply_enabled, auto_reply_message
      from artists where id = ${artistId}
    `;
    snapshot = {
      phone: (row.phone as string | null) ?? null,
      website: (row.website as string | null) ?? null,
      instagram: (row.instagram as string | null) ?? null,
      descriptionRo: (row.description_ro as string | null) ?? null,
      priceFrom: (row.price_from as number | null) ?? null,
      calendarEnabled: Boolean(row.calendar_enabled),
      bufferHours: (row.buffer_hours as number | null) ?? null,
      autoReplyEnabled: Boolean(row.auto_reply_enabled),
      autoReplyMessage: (row.auto_reply_message as string | null) ?? null,
    };
  });

  test.afterAll(async () => {
    // Restore every mutated field via direct SQL — we don't rely on the
    // same PUT path we're testing, so a test-introduced regression in PUT
    // cannot poison Igor's production profile.
    await sql`
      update artists
      set phone = ${snapshot.phone},
          website = ${snapshot.website},
          instagram = ${snapshot.instagram},
          description_ro = ${snapshot.descriptionRo},
          price_from = ${snapshot.priceFrom},
          calendar_enabled = ${snapshot.calendarEnabled},
          buffer_hours = ${snapshot.bufferHours},
          auto_reply_enabled = ${snapshot.autoReplyEnabled},
          auto_reply_message = ${snapshot.autoReplyMessage}
      where id = ${artistId}
    `;
  });

  test("GET /api/me/artist returns the full row for the signed-in artist", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.get("/api/me/artist");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.artist).toBeTruthy();
    expect(json.artist.id).toBe(artistId);
    // The endpoint now returns every column — spot-check the fields the
    // profile form needs to hydrate.
    expect(json.artist).toHaveProperty("descriptionRo");
    expect(json.artist).toHaveProperty("autoReplyMessage");
    expect(json.artist).toHaveProperty("bufferHours");
  });

  test("GET /api/me/artist anonymous → 401", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.get("/api/me/artist");
    expect(res.status()).toBe(401);
  });

  test("PUT /api/artists/crud persists every editable field", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });

    const payload = {
      id: artistId,
      phone: "+37369012345",
      website: "https://e2e-test.example.com",
      instagram: "e2e_test_igor",
      descriptionRo: "E2E test description — will be restored in afterAll.",
      priceFrom: 1234,
      calendarEnabled: true,
      bufferHours: 5,
      autoReplyEnabled: true,
      autoReplyMessage: "E2E auto reply — set by profile-roundtrip spec.",
    };

    const res = await req.put("/api/artists/crud", { data: payload });
    expect(res.status(), await res.text()).toBe(200);

    // Read back via the same endpoint the UI uses for hydrate, so we
    // verify round-trip on BOTH sides of the contract.
    const reread = await req.get("/api/me/artist");
    expect(reread.status()).toBe(200);
    const { artist } = await reread.json();

    expect(artist.phone).toBe(payload.phone);
    expect(artist.website).toBe(payload.website);
    expect(artist.instagram).toBe(payload.instagram);
    expect(artist.descriptionRo).toBe(payload.descriptionRo);
    expect(artist.priceFrom).toBe(payload.priceFrom);
    expect(artist.calendarEnabled).toBe(true);
    expect(artist.bufferHours).toBe(5);
    expect(artist.autoReplyEnabled).toBe(true);
    expect(artist.autoReplyMessage).toBe(payload.autoReplyMessage);
  });

  test("PUT rejects payload with missing id", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.put("/api/artists/crud", {
      data: { phone: "+37369000000" },
    });
    expect(res.status()).toBe(400);
  });
});
