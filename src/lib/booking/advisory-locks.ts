import { sql } from "drizzle-orm";

export const AVAIL_LOCK_VENUE = 280028;
export const AVAIL_LOCK_HALL = 280029;
export const AVAIL_LOCK_DAY = 280030;
export const AVAIL_LOCK_GROUP = 280031;
export const AVAIL_LOCK_ARTIST = 280033;
export const LEGAL_LOCK_ORG = 280040;
export const LEGAL_LOCK_USER = 280041;

export type AvailabilityLockKeys = {
  venueId: number;
  hallIds: number[];
  localDates: string[];
  conflictGroupIds: number[];
};

type LockTx = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

function yyyymmdd(date: string): number {
  return Number(date.replaceAll("-", ""));
}

/** Transactional advisory locks in deterministic order. */
export async function acquireAvailabilityLocks(tx: LockTx, keys: AvailabilityLockKeys): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${AVAIL_LOCK_VENUE}, ${keys.venueId})`);
  const days = [...new Set(keys.localDates)].sort();
  for (const day of days) {
    await tx.execute(sql`select pg_advisory_xact_lock(${AVAIL_LOCK_DAY}, ${yyyymmdd(day)})`);
  }
  const halls = [...new Set(keys.hallIds.filter((id) => Number.isFinite(id) && id > 0))].sort((a, b) => a - b);
  for (const hallId of halls) {
    await tx.execute(sql`select pg_advisory_xact_lock(${AVAIL_LOCK_HALL}, ${hallId})`);
  }
  const groups = [...new Set(keys.conflictGroupIds)].sort((a, b) => a - b);
  for (const groupId of groups) {
    await tx.execute(sql`select pg_advisory_xact_lock(${AVAIL_LOCK_GROUP}, ${groupId})`);
  }
}

export async function acquireArtistAvailabilityLocks(
  tx: LockTx,
  artistId: number,
  eventDate: string,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${AVAIL_LOCK_ARTIST}, ${artistId})`);
  await tx.execute(sql`select pg_advisory_xact_lock(${AVAIL_LOCK_DAY}, ${yyyymmdd(eventDate)})`);
}

/** Serialize organization legal writes (PATCH identity + signing). */
export async function acquireLegalScopeLock(
  tx: LockTx,
  scope: { organizationId?: number | null; userId?: string | null },
): Promise<void> {
  if (scope.organizationId) {
    await tx.execute(sql`select pg_advisory_xact_lock(${LEGAL_LOCK_ORG}, ${scope.organizationId})`);
    return;
  }
  if (scope.userId) {
    await tx.execute(sql`select pg_advisory_xact_lock(${LEGAL_LOCK_USER}, hashtext(${scope.userId}))`);
  }
}
