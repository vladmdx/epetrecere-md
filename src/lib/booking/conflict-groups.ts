import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookingRequests,
  venueHallConflictGroupMembers,
  venueHallConflictGroups,
  venueHalls,
  venueScheduleBlocks,
} from "@/lib/db/schema";
import { acquireAvailabilityLocks } from "./advisory-locks";
import { canonicalVenueInterval, intervalsOverlapHalfOpen } from "./zoned-interval";

const HOLD_STATUSES = ["pending", "accepted", "confirmed_by_client"] as const;

export async function saveVenueConflictGroup(input: {
  venueId: number;
  id?: number;
  name: string;
  hallIds: number[];
}): Promise<
  | { ok: true; id: number }
  | { ok: false; status: number; error: string; code: string }
> {
  const uniqueHalls = [...new Set(input.hallIds)];
  if (uniqueHalls.length < 2) {
    return { ok: false, status: 400, error: "Need at least two halls", code: "VALIDATION" };
  }
  try {
    const groupId = await db.transaction(async (tx) => {
      const halls = await tx
        .select({ id: venueHalls.id, venueId: venueHalls.venueId })
        .from(venueHalls)
        .where(inArray(venueHalls.id, uniqueHalls));
      if (halls.length !== uniqueHalls.length || halls.some((hall) => hall.venueId !== input.venueId)) {
        throw Object.assign(new Error("SAME_VENUE_REQUIRED"), { code: "SAME_VENUE_REQUIRED" });
      }
      await acquireAvailabilityLocks(tx, {
        venueId: input.venueId,
        hallIds: uniqueHalls,
        localDates: [],
        conflictGroupIds: input.id ? [input.id] : [],
      });

      let groupId = input.id;
      if (groupId) {
        const [existing] = await tx
          .select()
          .from(venueHallConflictGroups)
          .where(eq(venueHallConflictGroups.id, groupId))
          .for("update")
          .limit(1);
        if (!existing || existing.venueId !== input.venueId) {
          throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
        }
        await tx.update(venueHallConflictGroups).set({ name: input.name }).where(eq(venueHallConflictGroups.id, groupId));
        await tx.delete(venueHallConflictGroupMembers).where(eq(venueHallConflictGroupMembers.groupId, groupId));
      } else {
        const [created] = await tx
          .insert(venueHallConflictGroups)
          .values({ venueId: input.venueId, name: input.name })
          .returning();
        groupId = created.id;
      }
      await tx.insert(venueHallConflictGroupMembers).values(
        uniqueHalls.map((hallId) => ({ groupId: groupId!, hallId, venueId: input.venueId })),
      );

      const overlap = await conflictGroupHasExistingOverlap(tx as unknown as typeof db, input.venueId, uniqueHalls);
      if (overlap) {
        throw Object.assign(new Error("CONFLICT_GROUP_OVERLAP"), { code: "CONFLICT_GROUP_OVERLAP" });
      }
      return groupId!;
    });
    return { ok: true, id: groupId };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "SAME_VENUE_REQUIRED") {
      return { ok: false, status: 400, error: "Halls must belong to this venue", code };
    }
    if (code === "NOT_FOUND") return { ok: false, status: 404, error: "Not found", code };
    if (code === "CONFLICT_GROUP_OVERLAP") {
      return {
        ok: false,
        status: 409,
        error: "CONFLICT_GROUP_OVERLAP",
        code: "CONFLICT_GROUP_OVERLAP",
      };
    }
    throw error;
  }
}

async function conflictGroupHasExistingOverlap(
  q: typeof db,
  venueId: number,
  hallIds: number[],
): Promise<boolean> {
  const bookings = await q
    .select({
      hallId: bookingRequests.hallId,
      reservationScope: bookingRequests.reservationScope,
      eventDate: bookingRequests.eventDate,
      startTime: bookingRequests.startTime,
      endTime: bookingRequests.endTime,
      timezone: bookingRequests.timezone,
    })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.venueId, venueId),
        inArray(bookingRequests.status, [...HOLD_STATUSES]),
      ),
    );
  const blocks = await q
    .select()
    .from(venueScheduleBlocks)
    .where(eq(venueScheduleBlocks.venueId, venueId));

  const intervals: Array<{ hallId: number | null; startsAt: Date; endsAt: Date }> = [];
  for (const booking of bookings) {
    const interval = canonicalVenueInterval({
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone,
    });
    intervals.push({
      hallId: booking.reservationScope === "venue" ? null : booking.hallId,
      startsAt: interval.startsAt,
      endsAt: interval.endsAt,
    });
  }
  for (const block of blocks) {
    intervals.push({ hallId: block.hallId, startsAt: block.startsAt, endsAt: block.endsAt });
  }

  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i]!;
      const b = intervals[j]!;
      if (!intervalsOverlapHalfOpen(a.startsAt, a.endsAt, b.startsAt, b.endsAt)) continue;
      const aIn = a.hallId == null || hallIds.includes(a.hallId);
      const bIn = b.hallId == null || hallIds.includes(b.hallId);
      if (aIn && bIn && a.hallId !== b.hallId) return true;
    }
  }
  return false;
}
