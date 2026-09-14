import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  acquireLegalScopeLocks,
  acquireReferralCaptureGraphLock,
} from "@/lib/booking/advisory-locks";

type Executor = typeof db;

export const REFERRAL_CHAIN_MAX_DEPTH = 64;

export type ReferralCaptureResult =
  | { status: "captured"; code: string }
  | { status: "already_captured"; code: string }
  | { status: "user_not_found" }
  | { status: "referrer_invalid" }
  | { status: "cycle"; reason: "reaches_user" | "existing_cycle" | "depth" }
  | { status: "write_conflict" };

/**
 * Persist one immutable referral edge inside the caller's transaction.
 *
 * Lock order is globally fixed:
 *   referral graph advisory lock -> sorted user advisory locks -> sorted rows.
 * Every capture therefore runs its recursive cycle check against a committed
 * graph that no competing capture can change until this transaction ends.
 */
export async function captureReferralAttribution(
  tx: Executor,
  input: {
    userId: string;
    clerkId: string;
    referrerId: string;
    cleanCode: string;
  },
): Promise<ReferralCaptureResult> {
  await acquireReferralCaptureGraphLock(tx);
  await acquireLegalScopeLocks(tx, {
    userIds: [input.userId, input.referrerId],
  });

  const locked = await tx
    .select({
      id: users.id,
      clerkId: users.clerkId,
      referralCode: users.referralCode,
      referredByCode: users.referredByCode,
    })
    .from(users)
    .where(inArray(users.id, [input.userId, input.referrerId]))
    .orderBy(users.id)
    .for("update");
  const user = locked.find(({ id }) => id === input.userId);
  const referrer = locked.find(({ id }) => id === input.referrerId);

  if (!user || user.clerkId !== input.clerkId) {
    return { status: "user_not_found" };
  }
  if (user.referredByCode) {
    return { status: "already_captured", code: user.referredByCode };
  }
  if (
    !referrer ||
    referrer.id === user.id ||
    referrer.referralCode !== input.cleanCode
  ) {
    return { status: "referrer_invalid" };
  }

  const [chain] = await tx.execute<{
    reachesUser: boolean;
    existingCycle: boolean;
    depthExceeded: boolean;
  }>(sql`
    WITH RECURSIVE referral_chain AS (
      SELECT chain_user.id,
        chain_user.referred_by_code,
        ARRAY[chain_user.id]::uuid[] AS path,
        false AS cycle,
        0::integer AS depth
      FROM public.users AS chain_user
      WHERE chain_user.id = ${referrer.id}

      UNION ALL

      SELECT next_user.id,
        next_user.referred_by_code,
        chain.path || next_user.id,
        next_user.id = ANY(chain.path) AS cycle,
        chain.depth + 1
      FROM referral_chain AS chain
      JOIN public.users AS next_user
        ON next_user.referral_code = chain.referred_by_code
      WHERE chain.referred_by_code IS NOT NULL
        AND NOT chain.cycle
        AND chain.depth < ${REFERRAL_CHAIN_MAX_DEPTH}
    )
    SELECT coalesce(bool_or(id = ${user.id}), false) AS "reachesUser",
      coalesce(bool_or(cycle), false) AS "existingCycle",
      coalesce(bool_or(
        depth >= ${REFERRAL_CHAIN_MAX_DEPTH}
        AND referred_by_code IS NOT NULL
      ), false) AS "depthExceeded"
    FROM referral_chain
  `);

  if (chain?.reachesUser) {
    return { status: "cycle", reason: "reaches_user" };
  }
  if (chain?.existingCycle) {
    return { status: "cycle", reason: "existing_cycle" };
  }
  if (!chain || chain.depthExceeded) {
    return { status: "cycle", reason: "depth" };
  }

  const [captured] = await tx
    .update(users)
    .set({ referredByCode: input.cleanCode, updatedAt: new Date() })
    .where(and(eq(users.id, user.id), isNull(users.referredByCode)))
    .returning({ code: users.referredByCode });
  if (!captured?.code) return { status: "write_conflict" };
  return { status: "captured", code: captured.code };
}
