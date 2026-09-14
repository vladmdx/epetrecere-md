/**
 * Event-plan booking serialization regression.
 * Guarded disposable local DB only. Run: npm run test:booking-plan-concurrency
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  artists,
  bookingRequests,
  eventPlans,
  users,
  venues,
} from "../src/lib/db/schema";
import {
  withBookingRequestWrite,
  type BookingRequestWriteTx,
} from "../src/lib/booking/booking-request-write";
import {
  findArtistPlanBookingConflict,
  findVenuePlanBookingConflict,
  type PlanBookingConflict,
} from "../src/lib/booking/plan-booking-constraints";
import {
  acquireArtistAvailabilityLocks,
  acquireAvailabilityLocks,
} from "../src/lib/booking/advisory-locks";
import { checkArtistAvailability } from "../src/lib/booking/availability";

if (process.env.E2E_RUNTIME !== "1") {
  throw new Error(
    "booking-plan concurrency regression must run through scripts/run-guarded-db-test.ts",
  );
}

const MARK = `plan_booking_race_${Date.now()}_${randomUUID().slice(0, 8)}`;
const VENUE_DATE = "2032-06-12";
const ARTIST_DATE = "2032-06-13";

const ids = {
  user: "",
  venuePlan: 0,
  artistPlan: 0,
  venues: [] as number[],
  artists: [] as number[],
};

type Attempt =
  | { inserted: true; bookingId: number }
  | { inserted: false; conflict: PlanBookingConflict };

function executor(tx: BookingRequestWriteTx): typeof db {
  return tx as unknown as typeof db;
}

async function createVenueAttempt(venueId: number): Promise<Attempt> {
  return withBookingRequestWrite(
    { eventPlanId: ids.venuePlan, userId: ids.user },
    async (tx) => {
      const conflict = await findVenuePlanBookingConflict(
        executor(tx),
        ids.venuePlan,
        venueId,
      );
      if (conflict) return { inserted: false, conflict };

      // The production venue writer acquires these after the event-plan row.
      // Distinct venue ids prove that the plan lock, not an entity lock,
      // serializes this race.
      await acquireAvailabilityLocks(tx, {
        venueId,
        hallIds: [],
        localDates: [VENUE_DATE],
        conflictGroupIds: [],
      });
      const [booking] = await tx
        .insert(bookingRequests)
        .values({
          venueId,
          eventPlanId: ids.venuePlan,
          clientUserId: ids.user,
          clientName: MARK,
          clientPhone: "+37369000001",
          eventDate: VENUE_DATE,
          startTime: "18:00",
          endTime: "23:00",
          status: "pending",
        })
        .returning({ id: bookingRequests.id });
      return { inserted: true, bookingId: booking.id };
    },
  );
}

async function createArtistAttempt(artistId: number): Promise<Attempt> {
  return withBookingRequestWrite(
    { eventPlanId: ids.artistPlan, userId: ids.user },
    async (tx) => {
      const conflict = await findArtistPlanBookingConflict(
        executor(tx),
        ids.artistPlan,
        artistId,
      );
      if (conflict) return { inserted: false, conflict };

      await acquireArtistAvailabilityLocks(tx, artistId, ARTIST_DATE);
      const available = await checkArtistAvailability({
        artistId,
        eventDate: ARTIST_DATE,
        startTime: "18:00",
        endTime: "20:00",
        executor: executor(tx),
      });
      assert.equal(available.available, true);
      const [booking] = await tx
        .insert(bookingRequests)
        .values({
          artistId,
          eventPlanId: ids.artistPlan,
          clientUserId: ids.user,
          clientName: MARK,
          clientPhone: "+37369000001",
          eventDate: ARTIST_DATE,
          startTime: "18:00",
          endTime: "20:00",
          status: "pending",
        })
        .returning({ id: bookingRequests.id });
      return { inserted: true, bookingId: booking.id };
    },
  );
}

before(async () => {
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `${MARK}_client`,
      email: `${MARK}@example.invalid`,
      name: "Plan Race Client",
    })
    .returning({ id: users.id });
  ids.user = user.id;

  const plans = await db
    .insert(eventPlans)
    .values([
      { userId: ids.user, title: `${MARK} venue plan` },
      { userId: ids.user, title: `${MARK} artist plan` },
    ])
    .returning({ id: eventPlans.id });
  ids.venuePlan = plans[0].id;
  ids.artistPlan = plans[1].id;

  const venueRows = await db
    .insert(venues)
    .values([
      { nameRo: `${MARK} Venue A`, slug: `${MARK}-venue-a`, isActive: true },
      { nameRo: `${MARK} Venue B`, slug: `${MARK}-venue-b`, isActive: true },
    ])
    .returning({ id: venues.id });
  ids.venues = venueRows.map((row) => row.id);

  const artistRows = await db
    .insert(artists)
    .values([
      {
        nameRo: `${MARK} Artist A`,
        slug: `${MARK}-artist-a`,
        categoryIds: [987_654_321],
        isActive: true,
      },
      {
        nameRo: `${MARK} Artist B`,
        slug: `${MARK}-artist-b`,
        categoryIds: [987_654_321],
        isActive: true,
      },
    ])
    .returning({ id: artists.id });
  ids.artists = artistRows.map((row) => row.id);
});

after(async () => {
  const planIds = [ids.venuePlan, ids.artistPlan].filter(Boolean);
  if (planIds.length > 0) {
    await db
      .delete(bookingRequests)
      .where(inArray(bookingRequests.eventPlanId, planIds));
    await db.delete(eventPlans).where(inArray(eventPlans.id, planIds));
  }
  if (ids.artists.length > 0) {
    await db.delete(artists).where(inArray(artists.id, ids.artists));
  }
  if (ids.venues.length > 0) {
    await db.delete(venues).where(inArray(venues.id, ids.venues));
  }
  if (ids.user) await db.delete(users).where(eq(users.id, ids.user));
});

test("two different venues racing for one plan leave exactly one active request", async () => {
  const results = await Promise.all([
    createVenueAttempt(ids.venues[0]),
    createVenueAttempt(ids.venues[1]),
  ]);
  assert.equal(results.filter((result) => result.inserted).length, 1);
  const rejected = results.find((result) => !result.inserted);
  assert.ok(rejected && !rejected.inserted);
  assert.equal(rejected.conflict.status, 409);
  assert.match(rejected.conflict.error, /Așteaptă răspunsul de la .+72h/);

  const rows = await db
    .select({ venueId: bookingRequests.venueId })
    .from(bookingRequests)
    .where(eq(bookingRequests.eventPlanId, ids.venuePlan));
  assert.equal(rows.length, 1);
  assert.ok(ids.venues.includes(rows[0].venueId!));
});

test("two artists in one category racing for one plan leave one active request", async () => {
  const results = await Promise.all([
    createArtistAttempt(ids.artists[0]),
    createArtistAttempt(ids.artists[1]),
  ]);
  assert.equal(results.filter((result) => result.inserted).length, 1);
  const rejected = results.find((result) => !result.inserted);
  assert.ok(rejected && !rejected.inserted);
  assert.equal(rejected.conflict.status, 409);
  assert.match(rejected.conflict.error, /Așteaptă răspunsul lui .+24h/);

  const rows = await db
    .select({ artistId: bookingRequests.artistId })
    .from(bookingRequests)
    .where(eq(bookingRequests.eventPlanId, ids.artistPlan));
  assert.equal(rows.length, 1);
  assert.ok(ids.artists.includes(rows[0].artistId!));
});

test("locked ownership recheck rejects a different user without inserting", async () => {
  await assert.rejects(
    withBookingRequestWrite(
      { eventPlanId: ids.venuePlan, userId: randomUUID() },
      async () => assert.fail("write callback must not run"),
    ),
    /Event plan not found/,
  );
});
