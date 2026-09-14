import { eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  legalAcceptances,
  legalContractDeliveryOutbox,
} from "@/lib/db/schema";

type Executor = typeof db;

/**
 * Cancel pending legal delivery and remove address/account identifiers while
 * preserving only terminal delivery evidence (channel, role snapshot, time).
 * This covers both rows addressed to the erased account and every still
 * sendable row (including administrator copies) for a session signed by that
 * account. Otherwise an administrator could receive the signer's full PDF
 * after the signer has exercised account erasure.
 *
 * Callers already hold the user's row lock, which is also the delivery
 * worker's first lock.
 */
export async function scrubLegalContractDeliveriesForUserErasure(
  executor: Executor,
  userId: string,
  now = new Date(),
): Promise<number> {
  const rows = await executor
    .update(legalContractDeliveryOutbox)
    .set({
      recipientUserId: sql`CASE
        WHEN ${legalContractDeliveryOutbox.deliveredAt} IS NULL
          OR ${legalContractDeliveryOutbox.recipientUserId} = ${userId}::uuid
          THEN NULL
        ELSE ${legalContractDeliveryOutbox.recipientUserId}
      END`,
      recipientEmail: null,
      recipientKey: sql`CASE
        WHEN ${legalContractDeliveryOutbox.deliveredAt} IS NULL
          OR ${legalContractDeliveryOutbox.recipientUserId} = ${userId}::uuid
          THEN 'retired:' || ${legalContractDeliveryOutbox.id}::text
        ELSE ${legalContractDeliveryOutbox.recipientKey}
      END`,
      status: sql`CASE
        WHEN ${legalContractDeliveryOutbox.deliveredAt} IS NULL THEN 'cancelled'
        ELSE ${legalContractDeliveryOutbox.status}
      END`,
      cancelledAt: sql`CASE
        WHEN ${legalContractDeliveryOutbox.deliveredAt} IS NULL
          THEN COALESCE(${legalContractDeliveryOutbox.cancelledAt}, ${now})
        ELSE ${legalContractDeliveryOutbox.cancelledAt}
      END`,
      deadLetteredAt: sql`CASE
        WHEN ${legalContractDeliveryOutbox.deliveredAt} IS NULL THEN NULL
        ELSE ${legalContractDeliveryOutbox.deadLetteredAt}
      END`,
      lockedAt: null,
      leaseToken: null,
      lastError: null,
      updatedAt: now,
    })
    .where(or(
      eq(legalContractDeliveryOutbox.recipientUserId, userId),
      sql`${legalContractDeliveryOutbox.acceptanceSessionId} IN (
        SELECT DISTINCT ${legalAcceptances.acceptanceSessionId}
        FROM ${legalAcceptances}
        WHERE ${legalAcceptances.userId} = ${userId}::uuid
      )`,
    ))
    .returning({ id: legalContractDeliveryOutbox.id });
  return rows.length;
}
