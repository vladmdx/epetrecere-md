import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  acquireAccountPhoneLock,
  acquireLegalScopeLock,
} from "@/lib/booking/advisory-locks";

export type UserPhoneWriteResult =
  | { ok: true; phone: string | null }
  | { ok: false; code: "PHONE_IN_USE" | "USER_NOT_FOUND" };

/**
 * Claim a canonical phone while already inside a database transaction.
 *
 * The caller must use the normal user -> phone lock order. The helper locks
 * the phone identity, re-checks ownership after waiting, and only then writes;
 * this closes the SELECT/UPDATE race without requiring unsafe cleanup of
 * historical duplicate values during rollout.
 */
export async function writeUserPhoneLocked(
  executor: typeof db,
  userId: string,
  normalizedPhone: string | null,
  options: { onlyIfMissing?: boolean } = {},
): Promise<UserPhoneWriteResult> {
  if (normalizedPhone) {
    await acquireAccountPhoneLock(executor, normalizedPhone);
  }

  const [current] = await executor
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .for("update")
    .limit(1);
  if (!current) return { ok: false, code: "USER_NOT_FOUND" };
  if (options.onlyIfMissing && current.phone != null) {
    return { ok: true, phone: current.phone };
  }

  if (normalizedPhone) {
    const [collision] = await executor
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, normalizedPhone), ne(users.id, userId)))
      .limit(1);
    if (collision) return { ok: false, code: "PHONE_IN_USE" };
  }

  if (current.phone !== normalizedPhone) {
    const [updated] = await executor
      .update(users)
      .set({ phone: normalizedPhone, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (!updated) return { ok: false, code: "USER_NOT_FOUND" };
  }

  return { ok: true, phone: normalizedPhone };
}

/** Account-settings/webhook entry point using the same lock order as signup. */
export async function writeUserPhoneInDatabase(
  userId: string,
  normalizedPhone: string | null,
  options: { onlyIfMissing?: boolean } = {},
): Promise<UserPhoneWriteResult> {
  return db.transaction(async (tx) => {
    await acquireLegalScopeLock(tx, { userId });
    return writeUserPhoneLocked(
      tx as unknown as typeof db,
      userId,
      normalizedPhone,
      options,
    );
  });
}
