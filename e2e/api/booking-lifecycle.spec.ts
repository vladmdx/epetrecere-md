import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE, CLIENT_STATE } from "../helpers/paths";
import { sql, getIgorArtist, getTestUsers } from "../helpers/db";

// CAL-02 / BOOK-02 / BOOK-03 — bilateral booking lifecycle.
//
// Walks a booking through every legal state transition against the live API
// and verifies the DB side-effects:
//   1. Client POST  /api/booking-requests              → pending
//   2. Artist PUT   /api/booking-requests/{id} accept  → accepted + calendar blocked
//   3. Client PUT   /api/booking-requests/{id} client_confirm → confirmed_by_client
//   4. Artist PUT   /api/booking-requests/{id} accept  on a second booking
//   5. Client PUT   /api/booking-requests/{id} cancel  → cancelled + calendar unblocked
//   6. Artist PUT   /api/booking-requests/{id} reject  → rejected (no calendar change after cancel)

const BASE =
  process.env.E2E_BASE_URL || "https://epetrecere.md";

// A date far enough in the future that no real bookings could collide.
function futureDate(offsetDays: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 2);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.describe.serial("booking lifecycle (CAL-02 / BOOK-02 / BOOK-03)", () => {
  let bookingA: number;
  let bookingB: number;
  let dateA: string;
  let dateB: string;
  let artistId: number;
  let clientDbId: string;

  test.beforeAll(async () => {
    const artist = await getIgorArtist();
    const { client } = await getTestUsers();
    artistId = artist.id;
    clientDbId = client.id as string;
    dateA = futureDate(1);
    dateB = futureDate(2);

    // Guarantee no stale rows from a previous run on the same dates.
    await sql`
      delete from booking_requests
      where artist_id = ${artistId}
      and event_date in (${dateA}, ${dateB})
    `;
    await sql`
      delete from calendar_events
      where entity_type = 'artist'
      and entity_id = ${artistId}
      and date in (${dateA}, ${dateB})
      and source = 'booking'
    `;
  });

  test.afterAll(async () => {
    // Teardown: remove anything this spec created so the suite is idempotent.
    if (bookingA || bookingB) {
      const ids = [bookingA, bookingB].filter(Boolean);
      await sql`delete from offer_requests where artist_id = ${artistId} and event_date in (${dateA}, ${dateB})`;
      await sql`delete from booking_requests where id = any(${ids})`;
    }
    await sql`
      delete from calendar_events
      where entity_type = 'artist'
      and entity_id = ${artistId}
      and date in (${dateA}, ${dateB})
      and source = 'booking'
    `;
  });

  test("1. client creates a booking request (pending)", async () => {
    // The create endpoint is public — no storage state needed. But we want
    // the booking to be LINKED to the client's app-user id so the cancel
    // action later passes the ownership check. The API doesn't expose the
    // client_user_id field, so we update the row directly after insert.
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.post("/api/booking-requests", {
      data: {
        artistId,
        clientName: "E2E Test Client",
        clientPhone: "+37369000001",
        clientEmail: "client.test@epetrecere.md",
        eventDate: dateA,
        eventType: "nunta",
        guestCount: 100,
        message: "e2e test — please ignore",
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const json = await res.json();
    bookingA = json.id;

    // Link booking to the client's app-user so client_confirm/cancel work.
    await sql`update booking_requests set client_user_id = ${clientDbId} where id = ${bookingA}`;
  });

  test("2. artist accepts → status=accepted, calendar_events row inserted", async () => {
    // `action=accept` is gated by `requireBookingArtistOwner()` — anonymous
    // and wrong-user calls are rejected with 401/403. The dedicated
    // `booking-auth-negative.spec.ts` locks that in. Here we exercise the
    // happy path with Igor's persisted session so the gate passes.
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingA}`, {
      data: { action: "accept", reply: "e2e: accepted" },
    });
    expect(res.status(), await res.text()).toBe(200);

    const [row] = await sql`
      select status, artist_reply from booking_requests where id = ${bookingA}
    `;
    expect(row.status).toBe("accepted");

    const blocks = await sql`
      select date, status, source from calendar_events
      where entity_type = 'artist' and entity_id = ${artistId}
      and date = ${dateA} and source = 'booking'
    `;
    expect(blocks.length).toBe(1);
    expect(blocks[0].status).toBe("booked");
  });

  test("3. client confirms (action=client_confirm) → status=confirmed_by_client", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingA}`, {
      data: { action: "client_confirm" },
    });
    expect(res.status(), await res.text()).toBe(200);

    const [row] = await sql`select status from booking_requests where id = ${bookingA}`;
    expect(row.status).toBe("confirmed_by_client");
  });

  test("4. client cancels the confirmed booking → calendar_events row deleted (CAL-02)", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingA}`, {
      data: { action: "cancel" },
    });
    expect(res.status(), await res.text()).toBe(200);

    const [row] = await sql`select status from booking_requests where id = ${bookingA}`;
    expect(row.status).toBe("cancelled");

    // Calendar should no longer have the source=booking row for that date.
    const blocks = await sql`
      select 1 from calendar_events
      where entity_type = 'artist' and entity_id = ${artistId}
      and date = ${dateA} and source = 'booking'
    `;
    expect(blocks.length).toBe(0);
  });

  test("5. second booking → artist rejects (BOOK-03)", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.post("/api/booking-requests", {
      data: {
        artistId,
        clientName: "E2E Test Client 2",
        clientPhone: "+37369000002",
        clientEmail: "client.test@epetrecere.md",
        eventDate: dateB,
        eventType: "corporate",
      },
    });
    expect(res.status()).toBe(201);
    bookingB = (await res.json()).id;

    const artistReq = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const rej = await artistReq.put(`/api/booking-requests/${bookingB}`, {
      data: { action: "reject", reply: "e2e: not available" },
    });
    expect(rej.status()).toBe(200);

    const [row] = await sql`select status from booking_requests where id = ${bookingB}`;
    expect(row.status).toBe("rejected");

    // Reject on a still-pending booking should NOT create a calendar block
    // (and therefore nothing to clean up either).
    const blocks = await sql`
      select 1 from calendar_events
      where entity_type = 'artist' and entity_id = ${artistId}
      and date = ${dateB} and source = 'booking'
    `;
    expect(blocks.length).toBe(0);
  });
});
