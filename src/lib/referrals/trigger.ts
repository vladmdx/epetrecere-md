// Credit a referral milestone. Safe to call multiple times — the
// (referrer, referred, eventType) triple is UNIQUE in the DB so duplicate
// calls insert nothing.
//
// Call sites:
//   - venue onboarding finalize → triggerReferral(userId, "onboarded")
//   - artist onboarding finalize → triggerReferral(userId, "onboarded")
//   - first booking_request that goes to "accepted" for the referred user
//     → triggerReferral(userId, "first_booking")

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookingRequests, users, referralEvents } from "@/lib/db/schema";
import { acquireLegalScopeLocks } from "@/lib/booking/advisory-locks";
import { acquireBookingConfirmationBarrier } from "@/lib/booking/effect-outbox";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";
import {
  sanitizeReferralLedgerMetadata,
  type ReferralLedgerMetadata,
} from "@/lib/referrals/metadata";

const SAFE_REFERRAL_ERROR_CODES = new Set([
  "23502",
  "23503",
  "23505",
  "23514",
  "40001",
  "40P01",
  "55P03",
  "57014",
]);

/** Credit amount per milestone in EUR cents. Keep in sync with the
 *  Setări marketing copy ("invită prieteni → primești X€"). */
const MILESTONE_CREDITS: Record<string, number> = {
  signup: 0,
  onboarded: 500, // 5€
  first_booking: 2000, // 20€
};

type Milestone = keyof typeof MILESTONE_CREDITS;
type Executor = typeof db;
type ReferralParticipants = {
  referredUserId: string;
  referrerUserId: string;
  referralCode: string;
};
type LockedReferralParticipants = {
  referredUserId: string;
  referrerUserId: string;
};

async function resolveReferralParticipants(
  referredUserId: string,
): Promise<ReferralParticipants | { reason: string }> {
  const [referred] = await db
    .select({ id: users.id, referredByCode: users.referredByCode })
    .from(users)
    .where(eq(users.id, referredUserId))
    .limit(1);
  if (!referred) return { reason: "referred_not_found" };
  if (!referred.referredByCode) return { reason: "no_referrer" };
  const [referrer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.referralCode, referred.referredByCode))
    .limit(1);
  if (!referrer) return { reason: "referrer_gone" };
  return {
    referredUserId: referred.id,
    referrerUserId: referrer.id,
    referralCode: referred.referredByCode,
  };
}

async function creditReferralLocked(
  tx: Executor,
  participants: LockedReferralParticipants,
  eventType: Milestone,
  metadata: ReferralLedgerMetadata,
): Promise<{ ok: boolean; creditedCents?: number; reason?: string }> {
  const creditCents = MILESTONE_CREDITS[eventType];
  const [inserted] = await tx
    .insert(referralEvents)
    .values({
      referrerUserId: participants.referrerUserId,
      referredUserId: participants.referredUserId,
      eventType,
      creditCents,
      metadata,
    })
    .onConflictDoNothing({
      target: [
        referralEvents.referrerUserId,
        referralEvents.referredUserId,
        referralEvents.eventType,
      ],
    })
    .returning();
  if (!inserted) return { ok: false, reason: "already_credited" };

  if (creditCents > 0) {
    const [credited] = await tx
      .update(users)
      .set({
        referralCreditCents: sql`${users.referralCreditCents} + ${creditCents}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, participants.referrerUserId))
      .returning({ id: users.id });
    if (!credited) throw new Error("referrer_disappeared_during_credit");
  }
  return { ok: true, creditedCents: creditCents };
}

/** Lock both live account rows in the same UUID order used by notification
 * materialization, then revalidate the immutable attribution. */
async function lockReferralParticipants(
  tx: Executor,
  participants: ReferralParticipants,
): Promise<
  | { ok: true; participants: LockedReferralParticipants }
  | { ok: false; reason: string }
> {
  if (participants.referredUserId === participants.referrerUserId) {
    return { ok: false, reason: "self_referral" };
  }
  const rows = await tx
    .select({
      id: users.id,
      referralCode: users.referralCode,
      referredByCode: users.referredByCode,
    })
    .from(users)
    .where(sql`${users.id} IN (${participants.referredUserId}, ${participants.referrerUserId})`)
    .orderBy(users.id)
    .for("update");
  const referred = rows.find(({ id }) => id === participants.referredUserId);
  const referrer = rows.find(({ id }) => id === participants.referrerUserId);
  if (!referred) return { ok: false, reason: "referred_not_found" };
  if (referred.referredByCode !== participants.referralCode) {
    return { ok: false, reason: "referral_attribution_changed" };
  }
  if (!referrer || referrer.referralCode !== participants.referralCode) {
    return { ok: false, reason: "referrer_gone" };
  }
  return {
    ok: true,
    participants: {
      referredUserId: referred.id,
      referrerUserId: referrer.id,
    },
  };
}

/**
 * Fire-and-forget style (though this is async — caller should `await` or
 * `void` it). Returns the created event row or null if:
 *  - referred user has no `referredByCode`, OR
 *  - the referrer doesn't exist, OR
 *  - this exact milestone was already credited.
 */
export async function triggerReferral(
  referredUserId: string,
  eventType: Milestone,
  metadata: ReferralLedgerMetadata = {},
): Promise<{ ok: boolean; creditedCents?: number; reason?: string }> {
  if (!(eventType in MILESTONE_CREDITS)) {
    return { ok: false, reason: "unknown_event_type" };
  }

  // The ledger insert and cached balance increment are one atomic decision.
  // A crash can therefore never leave a unique event that permanently blocks
  // its corresponding credit on retry.
  try {
    const participants = await resolveReferralParticipants(referredUserId);
    if ("reason" in participants) {
      return { ok: false, reason: participants.reason };
    }
    return await db.transaction(async (tx) => {
      await acquireLegalScopeLocks(tx, {
        userIds: [participants.referredUserId, participants.referrerUserId],
      });
      const locked = await lockReferralParticipants(
        tx as unknown as Executor,
        participants,
      );
      if (!locked.ok) return { ok: false, reason: locked.reason };
      return creditReferralLocked(
        tx as unknown as Executor,
        locked.participants,
        eventType,
        sanitizeReferralLedgerMetadata(metadata),
      );
    });
  } catch (err) {
    const correlationId = createServerLogCorrelationId();
    console.error(
      "[referral] trigger failed",
      safeServerErrorLog(err, {
        correlationId,
        allowedCodes: SAFE_REFERRAL_ERROR_CODES,
      }),
    );
    return { ok: false, reason: "db_error" };
  }
}

/**
 * Linearize the first-booking credit against vendor cancellation. Whichever
 * transaction wins the shared booking barrier defines the outcome: a credit
 * is committed only while the booking is still confirmed/completed, and the
 * ledger row plus cached balance are part of that same transaction.
 */
export async function triggerFirstBookingReferral(input: {
  bookingId: number;
  referredUserId: string;
}): Promise<{ ok: boolean; creditedCents?: number; reason?: string }> {
  try {
    const participants = await resolveReferralParticipants(input.referredUserId);
    if ("reason" in participants) {
      return { ok: false, reason: participants.reason };
    }
    return await db.transaction(async (tx) => {
      const executor = tx as unknown as Executor;
      // Identity locks precede the booking barrier. Account erasure and this
      // worker can therefore never form a barrier->user / user->outbox cycle.
      await acquireLegalScopeLocks(tx, {
        userIds: [participants.referredUserId, participants.referrerUserId],
      });
      const locked = await lockReferralParticipants(executor, participants);
      if (!locked.ok) return { ok: false, reason: locked.reason };
      await acquireBookingConfirmationBarrier(executor, input.bookingId);
      const [booking] = await tx
        .select({
          status: bookingRequests.status,
          clientUserId: bookingRequests.clientUserId,
        })
        .from(bookingRequests)
        .where(eq(bookingRequests.id, input.bookingId))
        .for("share")
        .limit(1);
      if (
        !booking
        || booking.clientUserId !== input.referredUserId
        || (
          booking.status !== "confirmed_by_client"
          && booking.status !== "completed"
        )
      ) {
        return { ok: false, reason: "booking_not_confirmed" };
      }
      return creditReferralLocked(
        executor,
        locked.participants,
        "first_booking",
        {},
      );
    });
  } catch (err) {
    const correlationId = createServerLogCorrelationId();
    console.error(
      "[referral] first-booking trigger failed",
      safeServerErrorLog(err, {
        correlationId,
        allowedCodes: SAFE_REFERRAL_ERROR_CODES,
      }),
    );
    return { ok: false, reason: "db_error" };
  }
}

/**
 * Durable reconciliation for the derivable onboarding milestone. The user's
 * committed `onboarding_complete` flag is the source of truth, so a process
 * crash before an `after()` callback or a transient database failure cannot
 * lose the credit permanently. The unique ledger arbiter keeps retries safe.
 */
export async function reconcileOnboardedReferrals(options: {
  limit?: number;
} = {}): Promise<{
  selected: number;
  recovered: number;
  failed: number;
  skipped: number;
}> {
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 25)));
  const candidates = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`
      ${users.onboardingComplete} = true
      AND ${users.referredByCode} IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM ${users} AS valid_referrer
        WHERE lower(valid_referrer.referral_code) = lower(${users.referredByCode})
          AND valid_referrer.id <> ${users.id}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM ${referralEvents}
        WHERE ${referralEvents.referredUserId} = ${users.id}
          AND ${referralEvents.eventType} = 'onboarded'
      )
    `)
    .orderBy(users.id)
    .limit(limit);
  let recovered = 0;
  let failed = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const result = await triggerReferral(candidate.id, "onboarded", {
      recoveredBy: "onboarding_reconciler",
    });
    if (result.ok || result.reason === "already_credited") recovered += 1;
    else if (result.reason === "db_error") failed += 1;
    else skipped += 1;
  }
  return { selected: candidates.length, recovered, failed, skipped };
}
