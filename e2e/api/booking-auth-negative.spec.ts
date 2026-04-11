import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE, CLIENT_STATE } from "../helpers/paths";
import { sql, getIgorArtist, getTestUsers } from "../helpers/db";

// BOOK-AUTH-NEG — regression lockdown for the auth gates on
// `PUT /api/booking-requests/[id]`.
//
// Context: the original E2E booking-lifecycle pass surfaced a CRITIC — the
// `action=accept` / `action=reject` branches had no ownership check and any
// anonymous caller could flip a booking's status and mutate the target
// artist's calendar. The fix (commit 044ff00) added a
// `requireBookingArtistOwner()` helper that resolves Clerk id → users.id →
// artists.user_id, returning 401 (no session) / 403 (wrong user) before any
// write. `client_confirm` and `cancel` were already guarded with a
// client-ownership check against `clientUserId`.
//
// This spec locks those gates in by making the vulnerable calls from the
// wrong caller and asserting the API refuses to mutate state. For every
// negative attempt we re-read the DB row and verify:
//   1. the HTTP status is 401 or 403
//   2. the booking is STILL in `pending`
//   3. no `calendar_events` row with source='booking' exists on the date
//
// Together with the positive `booking-lifecycle.spec.ts` these two specs
// form a complete truth table for the endpoint.

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

function futureDate(offsetDays: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 2);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.describe.serial("booking auth negative (BOOK-AUTH-NEG)", () => {
  let bookingId: number;
  let eventDate: string;
  let artistId: number;
  let clientDbId: string;

  test.beforeAll(async () => {
    const artist = await getIgorArtist();
    const { client } = await getTestUsers();
    artistId = artist.id;
    clientDbId = client.id as string;
    eventDate = futureDate(7);

    await sql`
      delete from booking_requests
      where artist_id = ${artistId}
      and event_date = ${eventDate}
      and client_name = 'BOOK-AUTH-NEG Client'
    `;
    await sql`
      delete from calendar_events
      where entity_type = 'artist'
      and entity_id = ${artistId}
      and date = ${eventDate}
      and source = 'booking'
    `;

    // Seed a single pending booking linked to the test client so we can
    // try (and fail) to mutate it from the wrong callers.
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.post("/api/booking-requests", {
      data: {
        artistId,
        clientName: "BOOK-AUTH-NEG Client",
        clientPhone: "+37369000099",
        clientEmail: "client.test@epetrecere.md",
        eventDate,
        eventType: "nunta",
        guestCount: 50,
        message: "e2e negative auth — do not accept",
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    bookingId = (await res.json()).id;
    await sql`update booking_requests set client_user_id = ${clientDbId} where id = ${bookingId}`;
  });

  test.afterAll(async () => {
    if (bookingId) {
      await sql`delete from booking_requests where id = ${bookingId}`;
    }
    await sql`
      delete from calendar_events
      where entity_type = 'artist'
      and entity_id = ${artistId}
      and date = ${eventDate}
      and source = 'booking'
    `;
  });

  // Helper — after every failed attempt assert the world did not move.
  async function assertStillPending() {
    const [row] = await sql`
      select status from booking_requests where id = ${bookingId}
    `;
    expect(row.status).toBe("pending");

    const blocks = await sql`
      select 1 from calendar_events
      where entity_type = 'artist'
      and entity_id = ${artistId}
      and date = ${eventDate}
      and source = 'booking'
    `;
    expect(blocks.length).toBe(0);
  }

  test("accept: anonymous → 401, booking unchanged", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "accept" },
    });
    expect(res.status()).toBe(401);
    await assertStillPending();
  });

  test("accept: signed-in client (not the artist owner) → 403, booking unchanged", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "accept" },
    });
    expect(res.status()).toBe(403);
    await assertStillPending();
  });

  test("reject: anonymous → 401, booking unchanged", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "reject" },
    });
    expect(res.status()).toBe(401);
    await assertStillPending();
  });

  test("reject: signed-in client (not the artist owner) → 403, booking unchanged", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "reject" },
    });
    expect(res.status()).toBe(403);
    await assertStillPending();
  });

  test("client_confirm: anonymous → 401, booking unchanged", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "client_confirm" },
    });
    expect(res.status()).toBe(401);
    await assertStillPending();
  });

  test("client_confirm: signed-in artist (not the original client) → 403, booking unchanged", async () => {
    // The artist session is authenticated but `appUser.id` won't match
    // `booking.clientUserId`, so the gate returns 403 before we ever reach
    // the "must be accepted first" 409 branch.
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "client_confirm" },
    });
    expect(res.status()).toBe(403);
    await assertStillPending();
  });

  test("cancel: anonymous → 401, booking unchanged", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "cancel" },
    });
    expect(res.status()).toBe(401);
    await assertStillPending();
  });

  test("cancel: signed-in artist (not the original client) → 403, booking unchanged", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "cancel" },
    });
    expect(res.status()).toBe(403);
    await assertStillPending();
  });
});
