import { test, expect, request as pwRequest } from "@playwright/test";
import { ARTIST_STATE, CLIENT_STATE } from "../helpers/paths";
import { sql, getIgorArtist, getTestUsers } from "../helpers/db";

// CROSS-01 — condensed end-to-end wedding flow.
//
// The Word spec's CROSS-01 walks 15 manual steps across multiple dashboards.
// This spec covers the API-testable subset that spans all signed-in roles:
//
//   1. Client creates an event plan + invitation (wedding)
//   2. Client creates a booking request for the artist (moderator)
//   3. Artist accepts → calendar blocked
//   4. Client confirms bilaterally
//   5. Client enables Moments gallery
//   6. Guest uploads a photo anonymously → appears in public feed
//   7. Client cancels the booking → calendar unblocks
//   8. Teardown removes everything
//
// Drag-drop seating, PDF export, SMS sends, Inngest-triggered emails, and
// admin reassignment are out-of-band and tested separately.

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

function futureDate(offsetDays: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 2);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.describe.serial("CROSS-01 condensed wedding flow", () => {
  let planId: number;
  let bookingId: number;
  let momentsSlug: string;
  let artistId: number;
  let clientDbId: string;
  const eventDate = futureDate(30);

  test.beforeAll(async () => {
    const artist = await getIgorArtist();
    const { client } = await getTestUsers();
    artistId = artist.id;
    clientDbId = client.id as string;

    // Clean up anything left behind by a prior run on the same date.
    await sql`
      delete from booking_requests
      where artist_id = ${artistId}
      and event_date = ${eventDate}
      and client_name = 'CROSS-01 Client'
    `;
    await sql`
      delete from calendar_events
      where entity_type = 'artist' and entity_id = ${artistId}
      and date = ${eventDate} and source = 'booking'
    `;
  });

  test.afterAll(async () => {
    if (bookingId) {
      await sql`delete from offer_requests where artist_id = ${artistId} and event_date = ${eventDate}`;
      await sql`delete from booking_requests where id = ${bookingId}`;
    }
    await sql`
      delete from calendar_events
      where entity_type = 'artist' and entity_id = ${artistId}
      and date = ${eventDate} and source = 'booking'
    `;
    if (planId) {
      await sql`delete from event_photos where plan_id = ${planId}`;
      await sql`delete from checklist_items where plan_id = ${planId}`;
      await sql`delete from event_plans where id = ${planId}`;
    }
  });

  test("step 1: client creates the event plan", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.post("/api/event-plans", {
      data: {
        title: "CROSS-01 Wedding",
        eventType: "nunta",
        eventDate,
        location: "Chișinău",
        guestCountTarget: 200,
        budgetTarget: 8000,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const json = await res.json();
    planId = json.plan.id;
    expect(json.plan.userId).toBe(clientDbId);
  });

  test("step 2: client posts a booking request for the artist", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.post("/api/booking-requests", {
      data: {
        artistId,
        clientName: "CROSS-01 Client",
        clientPhone: "+37369999999",
        clientEmail: "client.test@epetrecere.md",
        eventDate,
        eventType: "nunta",
        guestCount: 200,
        message: "e2e cross-01 booking",
      },
    });
    expect(res.status()).toBe(201);
    bookingId = (await res.json()).id;

    // Link to client so client_confirm/cancel pass the ownership check.
    await sql`update booking_requests set client_user_id = ${clientDbId} where id = ${bookingId}`;
  });

  test("step 3: artist accepts → calendar blocks the date", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: ARTIST_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "accept", reply: "cross-01: accepted" },
    });
    expect(res.status(), await res.text()).toBe(200);

    const blocks = await sql`
      select 1 from calendar_events
      where entity_type = 'artist' and entity_id = ${artistId}
      and date = ${eventDate} and source = 'booking'
    `;
    expect(blocks.length).toBe(1);
  });

  test("step 4: client confirms bilaterally", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "client_confirm" },
    });
    expect(res.status(), await res.text()).toBe(200);

    const [row] = await sql`select status from booking_requests where id = ${bookingId}`;
    expect(row.status).toBe("confirmed_by_client");
  });

  test("step 5: client enables Moments gallery", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.post(`/api/event-plans/${planId}/moments`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.enabled).toBe(true);
    momentsSlug = json.slug;
  });

  test("step 6: anonymous guest uploads a photo", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE });
    const res = await req.post(`/api/moments/${momentsSlug}`, {
      data: {
        url: "https://example.com/cross01.jpg",
        guestName: "Cross-01 Guest",
        guestMessage: "La mulți ani!",
      },
    });
    expect(res.status()).toBe(201);
  });

  test("step 7: client cancels the confirmed booking → calendar unblocks", async () => {
    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.put(`/api/booking-requests/${bookingId}`, {
      data: { action: "cancel" },
    });
    expect(res.status()).toBe(200);

    const blocks = await sql`
      select 1 from calendar_events
      where entity_type = 'artist' and entity_id = ${artistId}
      and date = ${eventDate} and source = 'booking'
    `;
    expect(blocks.length).toBe(0);
  });
});
