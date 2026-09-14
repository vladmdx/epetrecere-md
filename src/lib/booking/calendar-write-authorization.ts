import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users, venues } from "@/lib/db/schema";
import {
  authorizeVenueCapabilityLocked,
  type AppUser,
} from "@/lib/venue-access";
import { acquireLegalScopeLocks } from "./advisory-locks";
import type {
  CalendarWriteTransaction,
  ManagedCalendarReplacementOptions,
} from "./calendar-write";

export class CalendarWriteAuthorizationError extends Error {
  readonly code = "CALENDAR_WRITE_FORBIDDEN";

  constructor(readonly status: 401 | 403 | 404 = 403) {
    super("Calendar write authorization changed.");
    this.name = "CalendarWriteAuthorizationError";
  }
}

async function lockCurrentUser(
  tx: CalendarWriteTransaction,
  userId: string,
): Promise<AppUser | null> {
  const [row] = await tx
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .for("share")
    .limit(1);
  return row
    ? {
        id: row.id,
        role: row.role,
        isGlobalAdmin: row.role === "admin" || row.role === "super_admin",
      }
    : null;
}

/** User/legal -> calendar entity/day -> venue/org/membership recheck. */
export function venueCalendarWriteAuthorization(input: {
  user: AppUser;
  venueId: number;
  organizationId: number | null;
}): ManagedCalendarReplacementOptions {
  let lockedUser: AppUser | null = null;
  return {
    beforeLocks: async (tx) => {
      await acquireLegalScopeLocks(tx, {
        userIds: [input.user.id],
        organizationIds:
          input.organizationId == null ? [] : [input.organizationId],
      });
      lockedUser = await lockCurrentUser(tx, input.user.id);
      if (!lockedUser) throw new CalendarWriteAuthorizationError(401);
    },
    authorizeAfterLocks: async (tx) => {
      if (!lockedUser) throw new CalendarWriteAuthorizationError(401);
      const [venue] = await tx
        .select({
          id: venues.id,
          organizationId: venues.organizationId,
        })
        .from(venues)
        .where(eq(venues.id, input.venueId))
        .for("share")
        .limit(1);
      if (!venue) throw new CalendarWriteAuthorizationError(404);
      // Reparenting to another organization would require a different legal
      // lock. Fail this attempt rather than discovering and locking it late.
      if (venue.organizationId !== input.organizationId) {
        throw new CalendarWriteAuthorizationError(403);
      }
      const access = await authorizeVenueCapabilityLocked(
        lockedUser,
        input.venueId,
        "manage_calendar",
        tx as unknown as typeof db,
      );
      if (!access.ok) throw new CalendarWriteAuthorizationError(access.status);
    },
  };
}

/** User/legal -> calendar entity/day -> artist ownership recheck. */
export function artistCalendarWriteAuthorization(input: {
  userId: string;
  artistId: number;
}): ManagedCalendarReplacementOptions {
  let userExists = false;
  return {
    beforeLocks: async (tx) => {
      await acquireLegalScopeLocks(tx, { userIds: [input.userId] });
      userExists = Boolean(await lockCurrentUser(tx, input.userId));
      if (!userExists) throw new CalendarWriteAuthorizationError(401);
    },
    authorizeAfterLocks: async (tx) => {
      if (!userExists) throw new CalendarWriteAuthorizationError(401);
      const [artist] = await tx
        .select({ id: artists.id })
        .from(artists)
        .where(and(
          eq(artists.id, input.artistId),
          eq(artists.userId, input.userId),
        ))
        .for("share")
        .limit(1);
      if (!artist) throw new CalendarWriteAuthorizationError(403);
    },
  };
}
