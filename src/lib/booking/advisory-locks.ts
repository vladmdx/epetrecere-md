import { sql } from "drizzle-orm";

export const AVAIL_LOCK_VENUE = 280028;
export const AVAIL_LOCK_HALL = 280029;
export const AVAIL_LOCK_DAY = 280030;
export const AVAIL_LOCK_GROUP = 280031;

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
