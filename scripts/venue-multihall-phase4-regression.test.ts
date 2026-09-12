/**
 * Phase 4 — hall availability, conflict groups, overnight/DST, concurrency,
 * calendar projection isolation, v1 HALL_REQUIRED, snapshots.
 * Guarded disposable local DB only. Run: npm run test:multihall:phase4
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  bookingRequests,
  calendarEvents,
  partnerOrganizationMembers,
  partnerOrganizations,
  users,
  venueHallConflictGroupMembers,
  venueHallConflictGroups,
  venueHalls,
  venueScheduleBlocks,
  venues,
} from "../src/lib/db/schema";
import {
  evaluateVenueAvailability,
} from "../src/lib/booking/venue-availability";
import {
  commercialSnapshotFor,
  VenueAvailabilityError,
  withVenueAvailabilityWrite,
} from "../src/lib/booking/venue-booking-write";
import {
  canonicalVenueInterval,
  intervalsOverlapHalfOpen,
  localDateInZone,
} from "../src/lib/booking/zoned-interval";

const MARK = `p4_${Date.now()}_`;
const DATE = "2027-10-10";

const ids = {
  owner: "",
  org: 0,
  venue: 0,
  extraVenue: 0,
  grand: 0,
  garden: 0,
  vip: 0,
  extraHall: 0,
};

function flagOn() {
  process.env.FEATURE_MULTI_HALL = "1";
}

async function availability(input: {
  hallId?: number | null;
  guestCount?: number;
  startTime?: string;
  endTime?: string;
  eventDate?: string;
  reservationScope?: "hall" | "venue";
  mode?: "public" | "owner";
  excludeBookingId?: number;
}) {
  return evaluateVenueAvailability({
    venueId: ids.venue,
    hallId: input.hallId,
    guestCount: input.guestCount,
    eventDate: input.eventDate ?? DATE,
    startTime: input.startTime ?? "18:00",
    endTime: input.endTime ?? "23:00",
    timezone: "Europe/Chisinau",
    reservationScope: input.reservationScope ?? "hall",
    mode: input.mode ?? "owner",
    excludeBookingId: input.excludeBookingId,
  });
}

before(async () => {
  flagOn();
  const [owner] = await db
    .insert(users)
    .values({ clerkId: MARK + "owner", email: `${MARK}owner@example.com` })
    .returning({ id: users.id });
  ids.owner = owner.id;
  const [org] = await db
    .insert(partnerOrganizations)
    .values({ displayName: MARK + "org", status: "active" })
    .returning({ id: partnerOrganizations.id });
  ids.org = org.id;
  await db.insert(partnerOrganizationMembers).values({
    organizationId: ids.org,
    userId: ids.owner,
    role: "owner",
    isActive: true,
  });
  const [venue] = await db
    .insert(venues)
    .values({
      nameRo: "Complex " + MARK,
      slug: MARK + "venue",
      organizationId: ids.org,
      userId: ids.owner,
      isActive: true,
      timezone: "Europe/Chisinau",
      bufferMinutes: 0,
    })
    .returning({ id: venues.id });
  ids.venue = venue.id;
  const [grand] = await db
    .insert(venueHalls)
    .values({
      venueId: ids.venue,
      slug: "grand",
      nameRo: "Grand",
      capacityMin: 20,
      capacityMax: 100,
      status: "active",
      bufferMinutes: 0,
    })
    .returning({ id: venueHalls.id });
  const [garden] = await db
    .insert(venueHalls)
    .values({
      venueId: ids.venue,
      slug: "garden",
      nameRo: "Garden",
      capacityMin: 50,
      capacityMax: 250,
      status: "active",
      bufferMinutes: 0,
    })
    .returning({ id: venueHalls.id });
  const [vip] = await db
    .insert(venueHalls)
    .values({
      venueId: ids.venue,
      slug: "vip",
      nameRo: "VIP",
      capacityMin: 10,
      capacityMax: 40,
      status: "active",
      bufferMinutes: 0,
    })
    .returning({ id: venueHalls.id });
  ids.grand = grand.id;
  ids.garden = garden.id;
  ids.vip = vip.id;
  const [extraVenue] = await db
    .insert(venues)
    .values({
      nameRo: "Extra " + MARK,
      slug: MARK + "extra",
      organizationId: ids.org,
      userId: null,
      isActive: true,
      timezone: "Europe/Chisinau",
      bufferMinutes: 0,
    })
    .returning({ id: venues.id });
  ids.extraVenue = extraVenue.id;
  const [extraHall] = await db
    .insert(venueHalls)
    .values({
      venueId: ids.extraVenue,
      slug: "other",
      nameRo: "Other",
      capacityMin: 10,
      capacityMax: 40,
      status: "active",
      bufferMinutes: 0,
    })
    .returning({ id: venueHalls.id });
  ids.extraHall = extraHall.id;
});

after(async () => {
  await db.delete(calendarEvents).where(eq(calendarEvents.entityId, ids.venue));
  await db.delete(calendarEvents).where(eq(calendarEvents.entityId, ids.extraVenue));
  await db.delete(bookingRequests).where(eq(bookingRequests.venueId, ids.venue));
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, ids.venue));
  await db.delete(venueHallConflictGroupMembers).where(eq(venueHallConflictGroupMembers.venueId, ids.venue));
  await db.delete(venueHallConflictGroups).where(eq(venueHallConflictGroups.venueId, ids.venue));
  await db.delete(venueHalls).where(eq(venueHalls.venueId, ids.venue));
  await db.delete(venueHalls).where(eq(venueHalls.venueId, ids.extraVenue));
  await db.delete(venues).where(eq(venues.id, ids.venue));
  await db.delete(venues).where(eq(venues.id, ids.extraVenue));
  await db.delete(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.organizationId, ids.org));
  await db.delete(partnerOrganizations).where(eq(partnerOrganizations.id, ids.org));
  await db.delete(users).where(eq(users.id, ids.owner));
});

test("Grand occupied leaves Garden/VIP free", async () => {
  const [booking] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      hallId: ids.grand,
      clientName: "A",
      clientPhone: "+37360000001",
      eventDate: DATE,
      startTime: "18:00",
      endTime: "23:00",
      status: "pending",
      reservationScope: "hall",
      timezone: "Europe/Chisinau",
      startsAt: canonicalVenueInterval({
        eventDate: DATE,
        startTime: "18:00",
        endTime: "23:00",
        timezone: "Europe/Chisinau",
      }).startsAt,
      endsAt: canonicalVenueInterval({
        eventDate: DATE,
        startTime: "18:00",
        endTime: "23:00",
        timezone: "Europe/Chisinau",
      }).endsAt,
    })
    .returning({ id: bookingRequests.id });
  const grand = await availability({ hallId: ids.grand });
  const garden = await availability({ hallId: ids.garden });
  const vip = await availability({ hallId: ids.vip });
  assert.equal(grand.available, false);
  assert.equal(grand.code, "BOOKING_CONFLICT");
  assert.equal(garden.available, true);
  assert.equal(vip.available, true);
  await db.delete(bookingRequests).where(eq(bookingRequests.id, booking.id));
});

test("150 guests exclude the 100-cap hall and accept 250", async () => {
  const tooSmall = await availability({ hallId: ids.grand, guestCount: 150 });
  const ok = await availability({ hallId: ids.garden, guestCount: 150 });
  assert.equal(tooSmall.available, false);
  assert.equal(tooSmall.code, "CAPACITY");
  assert.equal(ok.available, true);
});

test("whole-venue block makes every hall unavailable", async () => {
  const interval = canonicalVenueInterval({
    eventDate: DATE,
    startTime: "10:00",
    endTime: "16:00",
    timezone: "Europe/Chisinau",
  });
  const [block] = await db
    .insert(venueScheduleBlocks)
    .values({
      venueId: ids.venue,
      hallId: null,
      startsAt: interval.startsAt,
      endsAt: interval.endsAt,
      kind: "manual",
      source: "manual",
    })
    .returning({ id: venueScheduleBlocks.id });
  for (const hallId of [ids.grand, ids.garden, ids.vip]) {
    const result = await availability({ hallId, startTime: "12:00", endTime: "14:00" });
    assert.equal(result.available, false);
    assert.equal(result.code, "VENUE_BLOCK");
  }
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.id, block.id));
});

test("Grand–Garden conflict group blocks Garden, not VIP", async () => {
  const [group] = await db
    .insert(venueHallConflictGroups)
    .values({ venueId: ids.venue, name: "Grand-Garden" })
    .returning({ id: venueHallConflictGroups.id });
  await db.insert(venueHallConflictGroupMembers).values([
    { groupId: group.id, hallId: ids.grand, venueId: ids.venue },
    { groupId: group.id, hallId: ids.garden, venueId: ids.venue },
  ]);
  const interval = canonicalVenueInterval({
    eventDate: DATE,
    startTime: "18:00",
    endTime: "23:00",
    timezone: "Europe/Chisinau",
  });
  const [booking] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      hallId: ids.grand,
      clientName: "B",
      clientPhone: "+37360000002",
      eventDate: DATE,
      startTime: "18:00",
      endTime: "23:00",
      status: "accepted",
      reservationScope: "hall",
      timezone: "Europe/Chisinau",
      startsAt: interval.startsAt,
      endsAt: interval.endsAt,
    })
    .returning({ id: bookingRequests.id });
  const garden = await availability({ hallId: ids.garden });
  const vip = await availability({ hallId: ids.vip });
  assert.equal(garden.available, false);
  assert.equal(garden.code, "CONFLICT_GROUP");
  assert.equal(vip.available, true);
  await db.delete(bookingRequests).where(eq(bookingRequests.id, booking.id));
  await db.delete(venueHallConflictGroupMembers).where(eq(venueHallConflictGroupMembers.groupId, group.id));
  await db.delete(venueHallConflictGroups).where(eq(venueHallConflictGroups.id, group.id));
});

test("adjacent intervals respect half-open [start,end) and buffer", async () => {
  const first = canonicalVenueInterval({
    eventDate: DATE,
    startTime: "18:00",
    endTime: "22:00",
    timezone: "Europe/Chisinau",
  });
  const [booking] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      hallId: ids.vip,
      clientName: "C",
      clientPhone: "+37360000003",
      eventDate: DATE,
      startTime: "18:00",
      endTime: "22:00",
      status: "pending",
      reservationScope: "hall",
      timezone: "Europe/Chisinau",
      startsAt: first.startsAt,
      endsAt: first.endsAt,
    })
    .returning({ id: bookingRequests.id });
  const adjacent = await availability({ hallId: ids.vip, startTime: "22:00", endTime: "23:00" });
  assert.equal(adjacent.available, true, "half-open adjacent must be free when buffer is 0");
  await db.update(venueHalls).set({ bufferMinutes: 60 }).where(eq(venueHalls.id, ids.vip));
  const buffered = await availability({ hallId: ids.vip, startTime: "22:00", endTime: "23:00" });
  assert.equal(buffered.available, false);
  assert.equal(buffered.code, "BOOKING_CONFLICT");
  await db.update(venueHalls).set({ bufferMinutes: 0 }).where(eq(venueHalls.id, ids.vip));
  await db.delete(bookingRequests).where(eq(bookingRequests.id, booking.id));
});

test("overnight and DST Europe/Chisinau intervals are half-open and ordered", () => {
  const overnight = canonicalVenueInterval({
    eventDate: "2026-05-01",
    startTime: "22:00",
    endTime: "02:00",
    timezone: "Europe/Chisinau",
  });
  assert.ok(overnight.endsAt.getTime() > overnight.startsAt.getTime());
  assert.equal(localDateInZone(overnight.startsAt, "Europe/Chisinau"), "2026-05-01");
  assert.equal(localDateInZone(new Date(overnight.endsAt.getTime() - 1), "Europe/Chisinau"), "2026-05-02");

  const dst = canonicalVenueInterval({
    eventDate: "2026-03-29",
    startTime: "01:30",
    endTime: "04:30",
    timezone: "Europe/Chisinau",
  });
  assert.ok(dst.endsAt.getTime() > dst.startsAt.getTime());
  assert.equal(
    intervalsOverlapHalfOpen(overnight.startsAt, overnight.endsAt, overnight.startsAt, overnight.endsAt),
    true,
  );
});

test("two concurrent writes produce exactly one success", async () => {
  const input = {
    venueId: ids.venue,
    hallId: ids.grand,
    eventDate: "2027-11-11",
    startTime: "18:00",
    endTime: "23:00",
    timezone: "Europe/Chisinau",
    reservationScope: "hall" as const,
    mode: "owner" as const,
  };
  const write = () =>
    withVenueAvailabilityWrite(input, async (tx) => {
      const interval = canonicalVenueInterval({
        eventDate: input.eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        timezone: input.timezone,
      });
      const [row] = await tx
        .insert(bookingRequests)
        .values({
          venueId: ids.venue,
          hallId: ids.grand,
          clientName: "Race",
          clientPhone: "+37360000999",
          eventDate: input.eventDate,
          startTime: input.startTime,
          endTime: input.endTime,
          status: "pending",
          reservationScope: "hall",
          timezone: input.timezone,
          startsAt: interval.startsAt,
          endsAt: interval.endsAt,
        })
        .returning({ id: bookingRequests.id });
      return row.id;
    });
  const results = await Promise.allSettled([write(), write()]);
  const ok = results.filter((result) => result.status === "fulfilled");
  const failed = results.filter((result) => result.status === "rejected");
  assert.equal(ok.length, 1, JSON.stringify(results, null, 2));
  assert.equal(failed.length, 1);
  assert.ok(failed[0].status === "rejected" && failed[0].reason instanceof VenueAvailabilityError);
  await db.delete(bookingRequests).where(eq(bookingRequests.venueId, ids.venue));
});

test("cancelling booking A deletes only its calendar projection", async () => {
  const [a] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      hallId: ids.grand,
      clientName: "A",
      clientPhone: "+37360000004",
      eventDate: DATE,
      status: "completed",
    })
    .returning({ id: bookingRequests.id });
  const [b] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      hallId: ids.garden,
      clientName: "B",
      clientPhone: "+37360000005",
      eventDate: DATE,
      status: "completed",
    })
    .returning({ id: bookingRequests.id });
  await db.insert(calendarEvents).values([
    {
      entityType: "venue",
      entityId: ids.venue,
      date: DATE,
      status: "booked",
      source: "booking",
      bookingId: a.id,
      hallId: ids.grand,
    },
    {
      entityType: "venue",
      entityId: ids.venue,
      date: DATE,
      status: "booked",
      source: "booking",
      bookingId: b.id,
      hallId: ids.garden,
    },
  ]);
  await db.delete(calendarEvents).where(eq(calendarEvents.bookingId, a.id));
  const leftover = await db.select({ bookingId: calendarEvents.bookingId }).from(calendarEvents).where(eq(calendarEvents.entityId, ids.venue));
  assert.equal(leftover.length, 1);
  assert.equal(leftover[0].bookingId, b.id);
  await db.delete(calendarEvents).where(eq(calendarEvents.entityId, ids.venue));
  await db.delete(bookingRequests).where(inArray(bookingRequests.id, [a.id, b.id]));
});

test("public mode does not expose private conflict details", async () => {
  const interval = canonicalVenueInterval({
    eventDate: DATE,
    startTime: "18:00",
    endTime: "23:00",
    timezone: "Europe/Chisinau",
  });
  const [booking] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      hallId: ids.grand,
      clientName: "Secret Client",
      clientPhone: "+37360000006",
      eventDate: DATE,
      startTime: "18:00",
      endTime: "23:00",
      status: "pending",
      reservationScope: "hall",
      timezone: "Europe/Chisinau",
      startsAt: interval.startsAt,
      endsAt: interval.endsAt,
    })
    .returning({ id: bookingRequests.id });
  const result = await availability({ hallId: ids.grand, mode: "public" });
  assert.equal(result.available, false);
  assert.equal(result.message.includes("Secret Client"), false);
  assert.equal(result.message.includes("+373"), false);
  await db.delete(bookingRequests).where(eq(bookingRequests.id, booking.id));
});

test("v1 without hallId: one hall maps, two+ return HALL_REQUIRED", async () => {
  const many = await availability({ hallId: null });
  assert.equal(many.available, false);
  assert.equal(many.code, "HALL_REQUIRED");

  await db.update(venueHalls).set({ status: "archived" }).where(inArray(venueHalls.id, [ids.garden, ids.vip]));
  const one = await availability({ hallId: null });
  assert.equal(one.available, true);
  assert.equal(one.hallId, ids.grand);
  await db.update(venueHalls).set({ status: "active" }).where(inArray(venueHalls.id, [ids.garden, ids.vip]));
});

test("nonexistent hall is HALL_NOT_IN_VENUE", async () => {
  const result = await availability({ hallId: 2_147_483_646 });
  assert.equal(result.available, false);
  assert.equal(result.code, "HALL_NOT_IN_VENUE");
});

test("hall from another venue is HALL_NOT_IN_VENUE", async () => {
  const result = await availability({ hallId: ids.extraHall });
  assert.equal(result.available, false);
  assert.equal(result.code, "HALL_NOT_IN_VENUE");
});

test("deleting a hall SET NULLs calendar_events.hall_id and keeps the event", async () => {
  const [temp] = await db
    .insert(venueHalls)
    .values({
      venueId: ids.venue,
      slug: "temp-del",
      nameRo: "Temp",
      status: "active",
    })
    .returning({ id: venueHalls.id });
  const [event] = await db
    .insert(calendarEvents)
    .values({
      entityType: "venue",
      entityId: ids.venue,
      date: DATE,
      status: "blocked",
      source: "manual",
      hallId: temp.id,
      note: MARK + "keep",
    })
    .returning({ id: calendarEvents.id });
  await db.delete(venueHalls).where(eq(venueHalls.id, temp.id));
  const [kept] = await db
    .select({
      hallId: calendarEvents.hallId,
      entityId: calendarEvents.entityId,
      note: calendarEvents.note,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, event.id));
  assert.equal(kept.hallId, null);
  assert.equal(kept.entityId, ids.venue);
  assert.equal(kept.note, MARK + "keep");
});

test("commercial snapshot includes venue + hall names", async () => {
  const snapshot = await commercialSnapshotFor({
    venueId: ids.venue,
    hallId: ids.grand,
    reservationScope: "hall",
    agreedPrice: 1200,
    currency: "EUR",
    guestCount: 80,
  });
  assert.equal(snapshot.hallName, "Grand");
  assert.ok(String(snapshot.venueName).includes("Complex"));
  assert.equal(snapshot.hallId, ids.grand);
});
