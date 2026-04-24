// Credit a referral milestone. Safe to call multiple times — the
// (referrer, referred, eventType) triple is UNIQUE in the DB so duplicate
// calls insert nothing.
//
// Call sites:
//   - venue onboarding finalize → triggerReferral(userId, "onboarded")
//   - artist onboarding finalize → triggerReferral(userId, "onboarded")
//   - first booking_request that goes to "accepted" for the referred user
//     → triggerReferral(userId, "first_booking")

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, referralEvents, bookingRequests } from "@/lib/db/schema";

/** Credit amount per milestone in EUR cents. Keep in sync with the
 *  Setări marketing copy ("invită prieteni → primești X€"). */
const MILESTONE_CREDITS: Record<string, number> = {
  signup: 0,
  onboarded: 500, // 5€
  first_booking: 2000, // 20€
};

type Milestone = keyof typeof MILESTONE_CREDITS;

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
  metadata: Record<string, unknown> = {},
): Promise<{ ok: boolean; creditedCents?: number; reason?: string }> {
  if (!(eventType in MILESTONE_CREDITS)) {
    return { ok: false, reason: "unknown_event_type" };
  }

  const [referred] = await db
    .select({
      id: users.id,
      referredByCode: users.referredByCode,
    })
    .from(users)
    .where(eq(users.id, referredUserId))
    .limit(1);
  if (!referred) return { ok: false, reason: "referred_not_found" };
  if (!referred.referredByCode) return { ok: false, reason: "no_referrer" };

  const [referrer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.referralCode, referred.referredByCode))
    .limit(1);
  if (!referrer) return { ok: false, reason: "referrer_gone" };

  const creditCents = MILESTONE_CREDITS[eventType];

  // Dedupe: skip if this exact milestone was already credited.
  try {
    const [inserted] = await db
      .insert(referralEvents)
      .values({
        referrerUserId: referrer.id,
        referredUserId: referred.id,
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

    if (!inserted) {
      return { ok: false, reason: "already_credited" };
    }

    if (creditCents > 0) {
      await db
        .update(users)
        .set({
          referralCreditCents: sql`${users.referralCreditCents} + ${creditCents}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, referrer.id));
    }

    return { ok: true, creditedCents: creditCents };
  } catch (err) {
    console.error("[referral] trigger failed", err);
    return { ok: false, reason: "db_error" };
  }
}

/** Utility: should the `first_booking` trigger fire right now for this
 *  user? Returns true if they have zero prior accepted bookings (this is
 *  the milestone boundary). */
export async function isFirstBookingForUser(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.clientUserId, userId),
        inArray(bookingRequests.status, [
          "accepted",
          "confirmed_by_client",
          "completed",
        ]),
      ),
    )
    .limit(2);
  return rows.length <= 1; // the just-accepted one + any older = not first
}
