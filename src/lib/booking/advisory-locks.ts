import { sql } from "drizzle-orm";

export const AVAIL_LOCK_VENUE = 280028;
export const AVAIL_LOCK_HALL = 280029;
export const AVAIL_LOCK_DAY = 280030;
export const AVAIL_LOCK_GROUP = 280031;
export const AVAIL_LOCK_ARTIST = 280033;
export const LEGAL_LOCK_ORG = 280040;
export const LEGAL_LOCK_USER = 280041;
export const ACCOUNT_LOCK_PHONE = 280042;
export const BOOKING_CREATE_LOCK_IDEMPOTENCY = 280043;
export const REFERRAL_CAPTURE_GRAPH_LOCK = 280044;

export type AvailabilityLockKeys = {
  venueId: number;
  hallIds: number[];
  localDates: string[];
  conflictGroupIds: number[];
};

export type CalendarLockEntity = {
  entityType: "artist" | "venue";
  entityId: number;
};

type LockTx = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

function yyyymmdd(date: string): number {
  return Number(date.replaceAll("-", ""));
}

function artistAvailabilityLockDates(eventDate: string): string[] {
  const [year, month, day] = eventDate.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day);
  return [-1, 0, 1]
    .map((offset) =>
      new Date(base + offset * 86_400_000).toISOString().slice(0, 10))
    .sort();
}

/** Transactional advisory locks in deterministic order. */
export async function acquireAvailabilityLocks(
  tx: LockTx,
  keys: AvailabilityLockKeys,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${AVAIL_LOCK_VENUE}, ${keys.venueId})`,
  );
  const days = [...new Set(keys.localDates)].sort();
  for (const day of days) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${AVAIL_LOCK_DAY}, ${yyyymmdd(day)})`,
    );
  }
  const halls = [
    ...new Set(keys.hallIds.filter((id) => Number.isFinite(id) && id > 0)),
  ].sort((a, b) => a - b);
  for (const hallId of halls) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${AVAIL_LOCK_HALL}, ${hallId})`,
    );
  }
  const groups = [...new Set(keys.conflictGroupIds)].sort((a, b) => a - b);
  for (const groupId of groups) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${AVAIL_LOCK_GROUP}, ${groupId})`,
    );
  }
}

export async function acquireArtistAvailabilityLocks(
  tx: LockTx,
  artistId: number,
  eventDate: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${AVAIL_LOCK_ARTIST}, ${artistId})`,
  );
  // An artist interval may cross midnight and a previous-day interval may
  // extend into this date. Keep the global artist -> sorted days lock order.
  for (const day of artistAvailabilityLockDates(eventDate)) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${AVAIL_LOCK_DAY}, ${yyyymmdd(day)})`,
    );
  }
}

/**
 * Serialize calendar writers against booking availability checks.
 *
 * Cross-entity jobs (notably Google Calendar sync) must never acquire a day
 * and then discover another artist/venue to lock.  Sort the complete entity
 * set by the existing advisory namespace and id, acquire every entity lock,
 * and only then acquire the sorted day set.  Single-entity booking writers
 * already use the same entity -> day edge via the helpers above.
 */
export async function acquireCalendarEntityDayLocks(
  tx: LockTx,
  entities: readonly CalendarLockEntity[],
  localDates: readonly string[],
): Promise<void> {
  const entityLocks = [
    ...new Map(
      entities.map((entity) => {
        const namespace =
          entity.entityType === "venue" ? AVAIL_LOCK_VENUE : AVAIL_LOCK_ARTIST;
        return [
          `${namespace}:${entity.entityId}`,
          { namespace, entityId: entity.entityId },
        ] as const;
      }),
    ).values(),
  ].sort(
    (a, b) => a.namespace - b.namespace || a.entityId - b.entityId,
  );

  for (const entity of entityLocks) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${entity.namespace}, ${entity.entityId})`,
    );
  }

  const days = [...new Set(localDates)].sort();
  for (const day of days) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${AVAIL_LOCK_DAY}, ${yyyymmdd(day)})`,
    );
  }
}

/**
 * Serialize one booking-create idempotency identity before probing the
 * booking row. The DB unique index remains the final invariant; this lock
 * lets the loser observe and replay the committed row instead of surfacing a
 * constraint error. A 32-bit hash collision only adds harmless contention.
 */
export async function acquireBookingCreateIdempotencyLock(
  tx: LockTx,
  scopeHash: string,
  requestId: string,
): Promise<void> {
  const identity = `${scopeHash}:${requestId}`;
  await tx.execute(
    sql`select pg_advisory_xact_lock(${BOOKING_CREATE_LOCK_IDEMPOTENCY}, hashtext(${identity}))`,
  );
}

/**
 * Serialize every referral-attribution edge before taking any user row lock.
 * The graph is small and attribution is one-shot, so one stable transaction
 * lock gives cycle detection a complete committed graph and avoids opposing
 * A -> B / B -> A captures racing past one another.
 */
export async function acquireReferralCaptureGraphLock(
  tx: LockTx,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${REFERRAL_CAPTURE_GRAPH_LOCK}, 0)`,
  );
}

/**
 * Serialize legal authority and evidence writes. User locks are always taken
 * before organization locks; multiple keys use deterministic ordering.
 */
export async function acquireLegalScopeLocks(
  tx: LockTx,
  scope: {
    organizationIds?: readonly number[];
    userIds?: readonly string[];
  },
): Promise<void> {
  const users = [...new Set(scope.userIds?.filter(Boolean) ?? [])].sort();
  for (const userId of users) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${LEGAL_LOCK_USER}, hashtext(${userId}))`,
    );
  }
  const organizations = [
    ...new Set(
      scope.organizationIds?.filter((id) => Number.isFinite(id) && id > 0) ??
        [],
    ),
  ].sort((a, b) => a - b);
  for (const organizationId of organizations) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${LEGAL_LOCK_ORG}, ${organizationId})`,
    );
  }
}

/** Backwards-compatible single-scope helper. */
export async function acquireLegalScopeLock(
  tx: LockTx,
  scope: { organizationId?: number | null; userId?: string | null },
): Promise<void> {
  await acquireLegalScopeLocks(tx, {
    userIds: scope.userId ? [scope.userId] : [],
    organizationIds: scope.organizationId ? [scope.organizationId] : [],
  });
}

/**
 * Serialize claims for one canonical E.164 phone number. Callers that also
 * mutate an account must acquire the user legal lock first; that ordering is
 * shared by registration, settings, and Clerk synchronization.
 */
export async function acquireAccountPhoneLock(
  tx: LockTx,
  e164: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${ACCOUNT_LOCK_PHONE}, hashtext(${e164}))`,
  );
}
