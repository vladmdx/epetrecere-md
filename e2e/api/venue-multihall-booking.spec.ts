import { test, expect, request as pwRequest } from "@playwright/test";
import { CLIENT_STATE } from "../helpers/paths";
import { sql, getTestUsers, testBaseUrl } from "../helpers/db";

const BASE = testBaseUrl();
const MARK = "mh_book_";
const DATE = "2027-12-12";

test.describe.serial("venue multi-hall booking (phase 4)", () => {
  let venueId: number;
  let grandId: number;
  let gardenId: number;
  let organizationId: number;
  let ownerUserId: string;

  test.beforeAll(async () => {
    const { igor } = await getTestUsers();
    ownerUserId = igor.id as string;
    const [org] = await sql`insert into partner_organizations (display_name, status) values (${MARK + "org"}, 'active') returning id`;
    organizationId = org.id as number;
    await sql`
      insert into partner_organization_members (organization_id, user_id, role, is_active)
      values (${organizationId}, ${ownerUserId}, 'owner', true)
    `;
    const [venue] = await sql`
      insert into venues (name_ro, slug, organization_id, is_active, timezone, buffer_minutes)
      values (${MARK + "venue"}, ${MARK + "venue-" + Date.now()}, ${organizationId}, true, 'Europe/Chisinau', 0)
      returning id`;
    venueId = venue.id as number;
    const [grand] = await sql`
      insert into venue_halls (venue_id, slug, name_ro, capacity_min, capacity_max, status, buffer_minutes)
      values (${venueId}, 'grand', 'Grand', 20, 100, 'active', 0) returning id`;
    const [garden] = await sql`
      insert into venue_halls (venue_id, slug, name_ro, capacity_min, capacity_max, status, buffer_minutes)
      values (${venueId}, 'garden', 'Garden', 50, 250, 'active', 0) returning id`;
    grandId = grand.id as number;
    gardenId = garden.id as number;
  });

  test.afterAll(async () => {
    await sql`delete from booking_requests where venue_id = ${venueId}`;
    await sql`delete from venue_halls where venue_id = ${venueId}`;
    await sql`delete from venues where id = ${venueId}`;
    await sql`delete from partner_organization_members where organization_id = ${organizationId}`;
    await sql`delete from partner_organizations where id = ${organizationId}`;
  });

  test("v1 without hallId and two active halls → 409 HALL_REQUIRED", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: CLIENT_STATE });
    const res = await req.post("/api/booking-requests", {
      data: {
        venueId,
        clientName: "Client Test",
        clientPhone: "+37360001111",
        eventDate: DATE,
        startTime: "18:00",
        endTime: "23:00",
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("HALL_REQUIRED");
  });

  test("booking Grand leaves Garden bookable", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: CLIENT_STATE });
    const grand = await req.post("/api/booking-requests", {
      data: {
        venueId,
        hallId: grandId,
        clientName: "Client Test",
        clientPhone: "+37360001111",
        eventDate: DATE,
        startTime: "18:00",
        endTime: "23:00",
        guestCount: 80,
      },
    });
    expect(grand.status()).toBe(200);
    const garden = await req.post("/api/booking-requests", {
      data: {
        venueId,
        hallId: gardenId,
        clientName: "Client Test",
        clientPhone: "+37360001111",
        eventDate: DATE,
        startTime: "18:00",
        endTime: "23:00",
        guestCount: 80,
      },
    });
    expect(garden.status()).toBe(200);
  });

  test("second booking of the same hall/interval → 409", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: CLIENT_STATE });
    const res = await req.post("/api/booking-requests", {
      data: {
        venueId,
        hallId: grandId,
        clientName: "Client Test",
        clientPhone: "+37360001111",
        eventDate: DATE,
        startTime: "18:00",
        endTime: "23:00",
      },
    });
    expect(res.status()).toBe(409);
  });

  test("150 guests rejected on Grand (capacity 100)", async () => {
    const req = await pwRequest.newContext({ baseURL: BASE, storageState: CLIENT_STATE });
    const res = await req.post("/api/booking-requests", {
      data: {
        venueId,
        hallId: grandId,
        clientName: "Client Test",
        clientPhone: "+37360001111",
        eventDate: "2027-12-13",
        startTime: "18:00",
        endTime: "23:00",
        guestCount: 150,
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CAPACITY");
  });
});
