/**
 * Phase 4 — hall availability, conflict groups, overnight/DST, concurrency,
 * calendar projection isolation, v1 HALL_REQUIRED, snapshots.
 * Guarded disposable local DB only. Run: npm run test:multihall:phase4
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  bookingRequests,
  calendarEvents,
  commissions,
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
  publicVenueReservationScope,
  VenueAvailabilityError,
  withVenueAvailabilityWrite,
} from "../src/lib/booking/venue-booking-write";
import {
  acceptVenueBooking,
  BookingChangedError,
  clientCancelBooking,
  confirmBookingWithEffects,
  vendorCancelBooking,
} from "../src/lib/booking/booking-transitions";
import { persistConfirmationEffects } from "../src/lib/booking/confirmation-persist";
import { createVenueScheduleBlock, deleteVenueScheduleBlocks } from "../src/lib/booking/venue-schedule-write";
import { getMergedVenueCalendar } from "../src/lib/booking/merged-calendar";
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
  await db.delete(commissions).where(eq(commissions.venueId, ids.venue));
  await db.delete(calendarEvents).where(eq(calendarEvents.entityId, ids.venue));
  await db.delete(calendarEvents).where(eq(calendarEvents.entityId, ids.extraVenue));
  await db.execute(sql`DELETE FROM booking_effect_deliveries
    WHERE effect_id IN (
      SELECT o.id FROM booking_effect_outbox o
      JOIN booking_requests b ON b.id = o.booking_id
      WHERE b.venue_id = ${ids.venue}
    )`);
  await db.execute(sql`DELETE FROM booking_effect_outbox
    WHERE booking_id IN (SELECT id FROM booking_requests WHERE venue_id = ${ids.venue})`);
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

test("whole-venue scope and unusable Hall conflicts are symmetric", async () => {
  const [retiredHall] = await db
    .insert(venueHalls)
    .values({
      venueId: ids.venue,
      slug: "retired-scope-conflicts",
      nameRo: "Retired scope conflicts",
      capacityMin: 10,
      capacityMax: 40,
      status: "archived",
      bufferMinutes: 0,
    })
    .returning({ id: venueHalls.id });

  const hallBlockDate = "2027-12-01";
  const hallBlockInterval = canonicalVenueInterval({
    eventDate: hallBlockDate,
    startTime: "18:00",
    endTime: "22:00",
    timezone: "Europe/Chisinau",
  });
  const [hallBlock] = await db
    .insert(venueScheduleBlocks)
    .values({
      venueId: ids.venue,
      hallId: retiredHall.id,
      startsAt: hallBlockInterval.startsAt,
      endsAt: hallBlockInterval.endsAt,
      kind: "manual",
      source: "manual",
    })
    .returning({ id: venueScheduleBlocks.id });

  const sisterAgainstRetiredBlock = await availability({
    hallId: ids.grand,
    eventDate: hallBlockDate,
    reservationScope: "hall",
    startTime: "18:00",
    endTime: "22:00",
  });
  assert.equal(sisterAgainstRetiredBlock.available, true);
  const venueAgainstRetiredBlock = await availability({
    eventDate: hallBlockDate,
    reservationScope: "venue",
    startTime: "18:00",
    endTime: "22:00",
  });
  assert.equal(venueAgainstRetiredBlock.available, false);
  assert.equal(venueAgainstRetiredBlock.code, "HALL_BLOCK");
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.id, hallBlock.id));

  const wholeBlockDate = "2027-12-02";
  const wholeBlockInterval = canonicalVenueInterval({
    eventDate: wholeBlockDate,
    startTime: "18:00",
    endTime: "22:00",
    timezone: "Europe/Chisinau",
  });
  const [wholeBlock] = await db
    .insert(venueScheduleBlocks)
    .values({
      venueId: ids.venue,
      hallId: null,
      startsAt: wholeBlockInterval.startsAt,
      endsAt: wholeBlockInterval.endsAt,
      kind: "manual",
      source: "manual",
    })
    .returning({ id: venueScheduleBlocks.id });
  const hallAgainstWholeBlock = await availability({
    hallId: ids.grand,
    eventDate: wholeBlockDate,
    reservationScope: "hall",
    startTime: "18:00",
    endTime: "22:00",
  });
  assert.equal(hallAgainstWholeBlock.available, false);
  assert.equal(hallAgainstWholeBlock.code, "VENUE_BLOCK");
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.id, wholeBlock.id));

  const hallGoogleDate = "2027-12-03";
  const [hallGoogleEvent] = await db
    .insert(calendarEvents)
    .values({
      entityType: "venue",
      entityId: ids.venue,
      date: hallGoogleDate,
      status: "blocked",
      source: "google_sync",
      hallId: retiredHall.id,
      startTime: "18:00",
      endTime: "22:00",
    })
    .returning({ id: calendarEvents.id });
  const sisterAgainstRetiredGoogleEvent = await availability({
    hallId: ids.grand,
    eventDate: hallGoogleDate,
    reservationScope: "hall",
    startTime: "18:00",
    endTime: "22:00",
  });
  assert.equal(sisterAgainstRetiredGoogleEvent.available, true);
  const venueAgainstRetiredGoogleEvent = await availability({
    eventDate: hallGoogleDate,
    reservationScope: "venue",
    startTime: "18:00",
    endTime: "22:00",
  });
  assert.equal(venueAgainstRetiredGoogleEvent.available, false);
  assert.equal(venueAgainstRetiredGoogleEvent.code, "VENUE_BLOCK");
  await db.delete(calendarEvents).where(eq(calendarEvents.id, hallGoogleEvent.id));

  const wholeGoogleDate = "2027-12-04";
  const [wholeGoogleEvent] = await db
    .insert(calendarEvents)
    .values({
      entityType: "venue",
      entityId: ids.venue,
      date: wholeGoogleDate,
      status: "blocked",
      source: "google_sync",
      hallId: null,
      startTime: "18:00",
      endTime: "22:00",
    })
    .returning({ id: calendarEvents.id });
  const hallAgainstWholeGoogleEvent = await availability({
    hallId: ids.grand,
    eventDate: wholeGoogleDate,
    reservationScope: "hall",
    startTime: "18:00",
    endTime: "22:00",
  });
  assert.equal(hallAgainstWholeGoogleEvent.available, false);
  assert.equal(hallAgainstWholeGoogleEvent.code, "VENUE_BLOCK");
  await db.delete(calendarEvents).where(eq(calendarEvents.id, wholeGoogleEvent.id));

  const hallBookingDate = "2027-12-05";
  const [hallBooking] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      hallId: retiredHall.id,
      reservationScope: "hall",
      clientName: "Retired Hall booking",
      clientPhone: "+37360000031",
      eventDate: hallBookingDate,
      startTime: "18:00",
      endTime: "22:00",
      status: "accepted",
      timezone: "Europe/Chisinau",
    })
    .returning({ id: bookingRequests.id });
  const sisterAgainstRetiredBooking = await availability({
    hallId: ids.grand,
    eventDate: hallBookingDate,
    reservationScope: "hall",
    startTime: "18:00",
    endTime: "22:00",
  });
  assert.equal(sisterAgainstRetiredBooking.available, true);
  const venueAgainstRetiredBooking = await availability({
    eventDate: hallBookingDate,
    reservationScope: "venue",
    startTime: "18:00",
    endTime: "22:00",
  });
  assert.equal(venueAgainstRetiredBooking.available, false);
  assert.equal(venueAgainstRetiredBooking.code, "BOOKING_CONFLICT");
  assert.equal(venueAgainstRetiredBooking.conflictBookingId, hallBooking.id);
  await db.delete(bookingRequests).where(eq(bookingRequests.id, hallBooking.id));

  const wholeBookingDate = "2027-12-06";
  const [wholeBooking] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      // Historical data can retain a Hall reference even though the explicit
      // reservation scope closes the entire venue.
      hallId: retiredHall.id,
      reservationScope: "venue",
      clientName: "Whole venue stale Hall booking",
      clientPhone: "+37360000032",
      eventDate: wholeBookingDate,
      startTime: "18:00",
      endTime: "22:00",
      status: "accepted",
      timezone: "Europe/Chisinau",
    })
    .returning({ id: bookingRequests.id });
  const hallAgainstWholeBooking = await availability({
    hallId: ids.grand,
    eventDate: wholeBookingDate,
    reservationScope: "hall",
    startTime: "18:00",
    endTime: "22:00",
  });
  assert.equal(hallAgainstWholeBooking.available, false);
  assert.equal(hallAgainstWholeBooking.code, "BOOKING_CONFLICT");
  assert.equal(hallAgainstWholeBooking.conflictBookingId, wholeBooking.id);
  await db.delete(bookingRequests).where(eq(bookingRequests.id, wholeBooking.id));
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

test("whole-venue and conflict-group checks use each booking resource buffer", async () => {
  const insertBooking = async (input: {
    date: string;
    hallId: number | null;
    reservationScope: "hall" | "venue";
  }) => {
    const interval = canonicalVenueInterval({
      eventDate: input.date,
      startTime: "18:00",
      endTime: "22:00",
      timezone: "Europe/Chisinau",
    });
    const [booking] = await db
      .insert(bookingRequests)
      .values({
        venueId: ids.venue,
        hallId: input.hallId,
        clientName: "Asymmetric buffer",
        clientPhone: "+37360000033",
        eventDate: input.date,
        startTime: "18:00",
        endTime: "22:00",
        status: "accepted",
        reservationScope: input.reservationScope,
        timezone: "Europe/Chisinau",
        startsAt: interval.startsAt,
        endsAt: interval.endsAt,
      })
      .returning({ id: bookingRequests.id });
    return booking;
  };

  const bookingIds: number[] = [];
  let groupId: number | null = null;
  try {
    // A Hall override must survive a whole-venue request whose venue-level
    // buffer is shorter.
    await db.update(venues).set({ bufferMinutes: 0 }).where(eq(venues.id, ids.venue));
    await db.update(venueHalls).set({ bufferMinutes: 60 }).where(eq(venueHalls.id, ids.grand));
    const hallBooking = await insertBooking({
      date: "2027-12-10",
      hallId: ids.grand,
      reservationScope: "hall",
    });
    bookingIds.push(hallBooking.id);
    const wholeAfterHall = await availability({
      eventDate: "2027-12-10",
      reservationScope: "venue",
      startTime: "22:30",
      endTime: "23:30",
    });
    assert.equal(wholeAfterHall.available, false);
    assert.equal(wholeAfterHall.code, "BOOKING_CONFLICT");

    // Conversely, an existing whole-venue booking owns the venue buffer even
    // when the Hall requested afterwards has a shorter override.
    await db.update(venues).set({ bufferMinutes: 60 }).where(eq(venues.id, ids.venue));
    await db.update(venueHalls).set({ bufferMinutes: 0 }).where(eq(venueHalls.id, ids.vip));
    const wholeBooking = await insertBooking({
      date: "2027-12-11",
      hallId: null,
      reservationScope: "venue",
    });
    bookingIds.push(wholeBooking.id);
    const hallAfterWhole = await availability({
      hallId: ids.vip,
      eventDate: "2027-12-11",
      startTime: "22:30",
      endTime: "23:30",
    });
    assert.equal(hallAfterWhole.available, false);
    assert.equal(hallAfterWhole.code, "BOOKING_CONFLICT");

    // NULL Hall buffer inherits the venue value. A linked Hall with a zero
    // override must still respect the existing Hall's inherited buffer.
    await db.update(venues).set({ bufferMinutes: 45 }).where(eq(venues.id, ids.venue));
    await db.update(venueHalls).set({ bufferMinutes: null }).where(eq(venueHalls.id, ids.grand));
    await db.update(venueHalls).set({ bufferMinutes: 0 }).where(eq(venueHalls.id, ids.garden));
    const [group] = await db
      .insert(venueHallConflictGroups)
      .values({ venueId: ids.venue, name: "Asymmetric-buffer-group" })
      .returning({ id: venueHallConflictGroups.id });
    groupId = group.id;
    await db.insert(venueHallConflictGroupMembers).values([
      { groupId: group.id, hallId: ids.grand, venueId: ids.venue },
      { groupId: group.id, hallId: ids.garden, venueId: ids.venue },
    ]);
    const inheritedHallBooking = await insertBooking({
      date: "2027-12-12",
      hallId: ids.grand,
      reservationScope: "hall",
    });
    bookingIds.push(inheritedHallBooking.id);
    const linkedHall = await availability({
      hallId: ids.garden,
      eventDate: "2027-12-12",
      startTime: "22:30",
      endTime: "23:30",
    });
    assert.equal(linkedHall.available, false);
    assert.equal(linkedHall.code, "CONFLICT_GROUP");
  } finally {
    if (bookingIds.length > 0) {
      await db.delete(bookingRequests).where(inArray(bookingRequests.id, bookingIds));
    }
    if (groupId != null) {
      await db
        .delete(venueHallConflictGroupMembers)
        .where(eq(venueHallConflictGroupMembers.groupId, groupId));
      await db
        .delete(venueHallConflictGroups)
        .where(eq(venueHallConflictGroups.id, groupId));
    }
    await db.update(venues).set({ bufferMinutes: 0 }).where(eq(venues.id, ids.venue));
    await db
      .update(venueHalls)
      .set({ bufferMinutes: 0 })
      .where(inArray(venueHalls.id, [ids.grand, ids.garden, ids.vip]));
  }
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

function intervalOn(date: string, start = "18:00", end = "23:00") {
  return canonicalVenueInterval({
    eventDate: date,
    startTime: start,
    endTime: end,
    timezone: "Europe/Chisinau",
  });
}

async function insertPending(hallId: number, date: string, name: string, guestCount = 40) {
  const interval = intervalOn(date);
  const [row] = await db
    .insert(bookingRequests)
    .values({
      venueId: ids.venue,
      hallId,
      clientName: name,
      clientPhone: "+37360000111",
      eventDate: date,
      startTime: "18:00",
      endTime: "23:00",
      status: "pending",
      reservationScope: "hall",
      timezone: "Europe/Chisinau",
      startsAt: interval.startsAt,
      endsAt: interval.endsAt,
      guestCount,
    })
    .returning();
  return row;
}

test("public payload cannot block every hall", async () => {
  const forbidden = publicVenueReservationScope({ hallId: ids.grand, reservationScope: "venue" });
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) assert.equal(forbidden.code, "PUBLIC_VENUE_SCOPE_FORBIDDEN");
  const booking = await insertPending(ids.grand, "2027-12-01", "PublicHall");
  const garden = await availability({ hallId: ids.garden, eventDate: "2027-12-01" });
  assert.equal(garden.available, true);
  await db.delete(bookingRequests).where(eq(bookingRequests.id, booking.id));
});

test("concurrent accept: exactly one pending→accepted CAS wins", async () => {
  const booking = await insertPending(ids.grand, "2027-12-02", "RaceAccept");
  const results = await Promise.allSettled([
    acceptVenueBooking(booking, { reply: "a" }),
    acceptVenueBooking(booking, { reply: "b" }),
  ]);
  const ok = results.filter((result) => result.status === "fulfilled");
  const failed = results.filter((result) => result.status === "rejected");
  assert.equal(ok.length, 1, JSON.stringify(results, null, 2));
  assert.equal(failed.length, 1);
  assert.ok(
    failed[0].status === "rejected" &&
      (failed[0].reason instanceof BookingChangedError || failed[0].reason instanceof VenueAvailabilityError),
  );
  const [row] = await db.select({ status: bookingRequests.status }).from(bookingRequests).where(eq(bookingRequests.id, booking.id));
  assert.equal(row.status, "accepted");
  await db.delete(bookingRequests).where(eq(bookingRequests.id, booking.id));
});

test("concurrent confirm and retry keep a single calendar projection", async () => {
  const booking = await insertPending(ids.garden, "2027-12-03", "RaceConfirm", 80);
  const accepted = await acceptVenueBooking(booking, {});
  await db.update(bookingRequests).set({ clientConfirmedAt: new Date() }).where(eq(bookingRequests.id, accepted.id));
  const confirm = () =>
    confirmBookingWithEffects(accepted, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(bookingRequests)
        .set({ status: "confirmed_by_client", confirmedAt: now, updatedAt: now })
        .where(and(eq(bookingRequests.id, accepted.id), eq(bookingRequests.status, "accepted")))
        .returning();
      return row;
    });
  const results = await Promise.allSettled([confirm(), confirm()]);
  const ok = results.filter((result) => result.status === "fulfilled");
  assert.equal(ok.length, 1, JSON.stringify(results, null, 2));
  const [confirmed] = await db.select().from(bookingRequests).where(eq(bookingRequests.id, accepted.id));
  assert.equal(confirmed.status, "confirmed_by_client");
  await persistConfirmationEffects(db, confirmed);
  await persistConfirmationEffects(db, confirmed);
  const projections = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(eq(calendarEvents.bookingId, confirmed.id));
  assert.equal(projections.length, 1);
  await db.delete(commissions).where(eq(commissions.bookingRequestId, confirmed.id));
  await db.delete(calendarEvents).where(eq(calendarEvents.bookingId, confirmed.id));
  await db.execute(sql`DELETE FROM booking_effect_deliveries
    WHERE effect_id IN (SELECT id FROM booking_effect_outbox WHERE booking_id = ${confirmed.id})`);
  await db.execute(sql`DELETE FROM booking_effect_outbox WHERE booking_id = ${confirmed.id}`);
  await db.delete(bookingRequests).where(eq(bookingRequests.id, confirmed.id));
});

test("concurrent client cancel uses CAS", async () => {
  const booking = await insertPending(ids.vip, "2027-12-04", "RaceCancel");
  const results = await Promise.allSettled([
    clientCancelBooking(booking.id),
    clientCancelBooking(booking.id),
  ]);
  const ok = results.filter((result) => result.status === "fulfilled");
  assert.equal(ok.length, 1, JSON.stringify(results, null, 2));
  const [row] = await db.select({ status: bookingRequests.status }).from(bookingRequests).where(eq(bookingRequests.id, booking.id));
  assert.equal(row.status, "cancelled");
  await db.delete(bookingRequests).where(eq(bookingRequests.id, booking.id));
});

test("vendor cancel CAS and booking vs whole-venue block concurrency", async () => {
  const booking = await insertPending(ids.grand, "2027-12-05", "VsBlock");
  const accepted = await acceptVenueBooking(booking, {});
  const cancelled = await vendorCancelBooking(accepted.id);
  assert.equal(cancelled.status, "cancelled");
  const again = await vendorCancelBooking(accepted.id).catch((error) => error);
  assert.ok(again instanceof BookingChangedError);
  await db.delete(bookingRequests).where(eq(bookingRequests.id, accepted.id));

  const live = await insertPending(ids.grand, "2027-12-06", "LiveBlock");
  const race = await Promise.allSettled([
    acceptVenueBooking(live, {}),
    createVenueScheduleBlock({
      venueId: ids.venue,
      wholeVenue: true,
      eventDate: "2027-12-06",
      startTime: "18:00",
      endTime: "23:00",
      timezone: "Europe/Chisinau",
      createdBy: ids.owner,
    }),
  ]);
  const bookingWon = race[0].status === "fulfilled";
  const blockWon = race[1].status === "fulfilled" && race[1].value.ok;
  assert.equal(bookingWon !== blockWon, true, JSON.stringify(race, null, 2));
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, ids.venue));
  await db.delete(bookingRequests).where(eq(bookingRequests.id, live.id));
});

test("whole-venue and hall-specific blocks lock and refuse booking overlap", async () => {
  const occupied = await insertPending(ids.grand, "2027-12-07", "Occupied");
  const blocked = await createVenueScheduleBlock({
    venueId: ids.venue,
    hallId: ids.grand,
    wholeVenue: false,
    eventDate: "2027-12-07",
    startTime: "18:00",
    endTime: "23:00",
    timezone: "Europe/Chisinau",
    createdBy: ids.owner,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "AFFECTED_BOOKINGS");
  const missing = await createVenueScheduleBlock({
    venueId: ids.venue,
    eventDate: "2027-12-08",
    createdBy: ids.owner,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "HALL_OR_WHOLE_VENUE_REQUIRED");
  const whole = await createVenueScheduleBlock({
    venueId: ids.venue,
    wholeVenue: true,
    eventDate: "2027-12-08",
    timezone: "Europe/Chisinau",
    createdBy: ids.owner,
  });
  assert.equal(whole.ok, true, JSON.stringify(whole));
  const perHall = await createVenueScheduleBlock({
    venueId: ids.venue,
    hallId: ids.vip,
    wholeVenue: false,
    eventDate: "2027-12-09",
    timezone: "Europe/Chisinau",
    createdBy: ids.owner,
  });
  assert.equal(perHall.ok, true);
  const merged = await getMergedVenueCalendar({
    venueId: ids.venue,
    monthStartIso: "2027-12-01",
    monthEndIso: "2027-12-31",
  });
  assert.ok(merged.some((row) => row.date === "2027-12-08" && row.status === "blocked" && row.source === "block"));
  assert.ok(merged.some((row) => row.date === "2027-12-09" && row.hallId === ids.vip));
  const gardenFree = await availability({ hallId: ids.garden, eventDate: "2027-12-09" });
  assert.equal(gardenFree.available, true);
  const vipBlocked = await availability({ hallId: ids.vip, eventDate: "2027-12-09" });
  assert.equal(vipBlocked.available, false);
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, ids.venue));
  await db.delete(bookingRequests).where(eq(bookingRequests.id, occupied.id));
});

test("editing one hall must not delete a sister hall block", async () => {
  const grand = await createVenueScheduleBlock({
    venueId: ids.venue,
    hallId: ids.grand,
    wholeVenue: false,
    eventDate: "2027-12-12",
    timezone: "Europe/Chisinau",
    createdBy: ids.owner,
  });
  const garden = await createVenueScheduleBlock({
    venueId: ids.venue,
    hallId: ids.garden,
    wholeVenue: false,
    eventDate: "2027-12-12",
    timezone: "Europe/Chisinau",
    createdBy: ids.owner,
  });
  assert.equal(grand.ok, true);
  assert.equal(garden.ok, true);
  const removed = await deleteVenueScheduleBlocks({
    venueId: ids.venue,
    eventDate: "2027-12-12",
    hallId: ids.grand,
    wholeVenue: false,
    timezone: "Europe/Chisinau",
  });
  assert.equal(removed.ok, true);
  const leftover = await db.select().from(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, ids.venue));
  assert.equal(leftover.filter((row) => row.hallId === ids.grand).length, 0);
  assert.equal(leftover.filter((row) => row.hallId === ids.garden).length, 1);
  await db.delete(venueScheduleBlocks).where(eq(venueScheduleBlocks.venueId, ids.venue));
});

test("legacy calendar_events blocked day is not bookable", async () => {
  await db.insert(calendarEvents).values({
    entityType: "venue",
    entityId: ids.venue,
    date: "2027-12-11",
    status: "blocked",
    source: "manual",
  });
  const result = await availability({ hallId: ids.grand, eventDate: "2027-12-11" });
  assert.equal(result.available, false);
  assert.equal(result.code, "VENUE_BLOCK");
  await db.delete(calendarEvents).where(and(eq(calendarEvents.entityId, ids.venue), eq(calendarEvents.date, "2027-12-11")));
});
