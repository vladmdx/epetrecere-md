import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  legalAcceptances,
  legalContractDeliveryOutbox,
  users,
} from "@/lib/db/schema";
import type { EmailAttachment } from "@/lib/email/send";
import {
  generateSignedContractPdf,
  signedContractPdfFilename,
  validateSignedContractSession,
} from "@/lib/legal/signed-contract-pdf";
import {
  legalContractDeliverySafeFailure,
  legalContractDeliverySafeLog,
  legalDeliveryRecipientIsAuthorized,
} from "@/lib/legal/contract-delivery-policy";
import {
  sendLegalContractEmail,
  type LegalContractDeliveryEmail,
} from "@/lib/legal/contract-delivery-provider";

export const LEGAL_DELIVERY_MAX_ATTEMPTS = 8;
const DELIVERY_LEASE_MS = 5 * 60 * 1000;
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_CAP_MS = 24 * 60 * 60 * 1000;

type Executor = typeof db;

export type ContractDeliveryDependencies = {
  generatePdf?: typeof generateSignedContractPdf;
  sendEmail?: (input: LegalContractDeliveryEmail) => Promise<unknown>;
  now?: () => Date;
  /** Bounded Vercel fallback; primary Inngest processing keeps the default. */
  maxRecipientsPerSession?: number;
  /** Provider deadline override for the bounded Vercel fallback. */
  providerTimeoutMs?: number;
};

export type ContractDeliveryResult =
  | "delivered"
  | "already_delivered"
  | "cancelled"
  | "dead_lettered"
  | "busy"
  | "missing";

type ClaimedDelivery = typeof legalContractDeliveryOutbox.$inferSelect & {
  leaseToken: string;
};

/** Exponential retry with a finite cap; exported for deterministic tests. */
export function legalContractRetryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 20));
  return Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_CAP_MS);
}

function legalDeliveryBatchLimit(value: number | undefined, fallback = 100): number {
  const candidate = typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : fallback;
  return Math.max(1, Math.min(candidate, 100));
}

/**
 * A worker can disappear after incrementing the final attempt but before it
 * records failure. Once that lease expires, close the row explicitly instead
 * of leaving a permanent `processing` job that can never be claimed again.
 */
async function deadLetterExpiredFinalAttempts(
  now: Date,
  acceptanceSessionId?: string,
  limit = 100,
): Promise<number> {
  const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
  const batchLimit = legalDeliveryBatchLimit(limit);
  return db.transaction(async (tx) => {
    const retryableFinalAttempt = and(
      acceptanceSessionId
        ? eq(legalContractDeliveryOutbox.acceptanceSessionId, acceptanceSessionId)
        : undefined,
      isNull(legalContractDeliveryOutbox.deliveredAt),
      isNull(legalContractDeliveryOutbox.deadLetteredAt),
      isNull(legalContractDeliveryOutbox.cancelledAt),
      gte(legalContractDeliveryOutbox.attempts, LEGAL_DELIVERY_MAX_ATTEMPTS),
      or(
        isNull(legalContractDeliveryOutbox.lockedAt),
        lt(legalContractDeliveryOutbox.lockedAt, staleBefore),
      ),
    );
    const candidates = await tx
      .select({ id: legalContractDeliveryOutbox.id })
      .from(legalContractDeliveryOutbox)
      .where(retryableFinalAttempt)
      .orderBy(
        asc(legalContractDeliveryOutbox.updatedAt),
        asc(legalContractDeliveryOutbox.id),
      )
      .limit(batchLimit)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return 0;

    const rows = await tx
      .update(legalContractDeliveryOutbox)
      .set({
        status: "dead_letter",
        recipientUserId: null,
        recipientEmail: null,
        recipientKey: sql`'retired:' || ${legalContractDeliveryOutbox.id}::text`,
        lockedAt: null,
        leaseToken: null,
        deadLetteredAt: now,
        lastError: sql`coalesce(${legalContractDeliveryOutbox.lastError}, 'delivery lease expired after maximum attempts')`,
        updatedAt: now,
      })
      .where(and(
        inArray(
          legalContractDeliveryOutbox.id,
          candidates.map((candidate) => candidate.id),
        ),
        retryableFinalAttempt,
      ))
      .returning({ id: legalContractDeliveryOutbox.id });
    return rows.length;
  });
}

async function claimDueRecipients(
  acceptanceSessionId: string,
  now: Date,
  limit = 100,
): Promise<ClaimedDelivery[]> {
  const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
  const candidates = await db
    .select({ id: legalContractDeliveryOutbox.id })
    .from(legalContractDeliveryOutbox)
    .where(
      and(
        eq(legalContractDeliveryOutbox.acceptanceSessionId, acceptanceSessionId),
        isNull(legalContractDeliveryOutbox.deliveredAt),
        isNull(legalContractDeliveryOutbox.deadLetteredAt),
        isNull(legalContractDeliveryOutbox.cancelledAt),
        lt(legalContractDeliveryOutbox.attempts, LEGAL_DELIVERY_MAX_ATTEMPTS),
        lte(legalContractDeliveryOutbox.nextAttemptAt, now),
        or(
          isNull(legalContractDeliveryOutbox.lockedAt),
          lt(legalContractDeliveryOutbox.lockedAt, staleBefore),
        ),
      ),
    )
    .orderBy(
      asc(legalContractDeliveryOutbox.nextAttemptAt),
      asc(legalContractDeliveryOutbox.createdAt),
      asc(legalContractDeliveryOutbox.id),
    )
    .limit(legalDeliveryBatchLimit(limit));

  const claimed: ClaimedDelivery[] = [];
  for (const candidate of candidates) {
    const leaseToken = randomUUID();
    const [row] = await db
      .update(legalContractDeliveryOutbox)
      .set({
        status: "processing",
        attempts: sql`${legalContractDeliveryOutbox.attempts} + 1`,
        lockedAt: now,
        leaseToken,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(legalContractDeliveryOutbox.id, candidate.id),
          isNull(legalContractDeliveryOutbox.deliveredAt),
          isNull(legalContractDeliveryOutbox.deadLetteredAt),
          isNull(legalContractDeliveryOutbox.cancelledAt),
          lt(legalContractDeliveryOutbox.attempts, LEGAL_DELIVERY_MAX_ATTEMPTS),
          lte(legalContractDeliveryOutbox.nextAttemptAt, now),
          or(
            isNull(legalContractDeliveryOutbox.lockedAt),
            lt(legalContractDeliveryOutbox.lockedAt, staleBefore),
          ),
        ),
      )
      .returning();
    if (row) claimed.push({ ...row, leaseToken });
  }
  return claimed;
}

async function failDelivery(
  delivery: ClaimedDelivery,
  error: unknown,
  failedAt: Date,
): Promise<void> {
  const safeFailure = legalContractDeliverySafeFailure(error);
  const exhausted = delivery.attempts >= LEGAL_DELIVERY_MAX_ATTEMPTS;
  await db
    .update(legalContractDeliveryOutbox)
    .set({
      status: exhausted ? "dead_letter" : "failed",
      nextAttemptAt: exhausted
        ? delivery.nextAttemptAt
        : new Date(failedAt.getTime() + legalContractRetryDelayMs(delivery.attempts)),
      lockedAt: null,
      leaseToken: null,
      deadLetteredAt: exhausted ? failedAt : null,
      ...(exhausted
        ? {
            recipientUserId: null,
            recipientEmail: null,
            recipientKey: sql`'retired:' || ${legalContractDeliveryOutbox.id}::text`,
          }
        : {}),
      lastError: safeFailure,
      updatedAt: failedAt,
    })
    .where(
      and(
        eq(legalContractDeliveryOutbox.id, delivery.id),
        eq(legalContractDeliveryOutbox.leaseToken, delivery.leaseToken),
      ),
    );
}

async function completeDelivery(
  executor: Executor,
  delivery: ClaimedDelivery,
  deliveredAt: Date,
): Promise<boolean> {
  const [completed] = await executor
    .update(legalContractDeliveryOutbox)
    .set({
      status: "delivered",
      deliveredAt,
      lockedAt: null,
      leaseToken: null,
      lastError: null,
      // The timestamp/channel/role snapshot are sufficient evidence after a
      // successful send; retaining the address indefinitely is unnecessary.
      recipientEmail: null,
      updatedAt: deliveredAt,
    })
    .where(
      and(
        eq(legalContractDeliveryOutbox.id, delivery.id),
        eq(legalContractDeliveryOutbox.leaseToken, delivery.leaseToken),
      ),
    )
    .returning({ id: legalContractDeliveryOutbox.id });
  return Boolean(completed);
}

async function currentDeliveryState(
  acceptanceSessionId: string,
): Promise<ContractDeliveryResult> {
  const rows = await db
    .select({
      deliveredAt: legalContractDeliveryOutbox.deliveredAt,
      deadLetteredAt: legalContractDeliveryOutbox.deadLetteredAt,
      cancelledAt: legalContractDeliveryOutbox.cancelledAt,
    })
    .from(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, acceptanceSessionId));
  if (!rows.length) return "missing";
  if (rows.every((row) => row.deliveredAt || row.cancelledAt)) {
    return rows.some((row) => row.deliveredAt)
      ? "already_delivered"
      : "cancelled";
  }
  if (rows.some((row) => row.deadLetteredAt)) return "dead_lettered";
  return "busy";
}

type PreparedDelivery = {
  attachment: EmailAttachment;
  sendEmail: (input: LegalContractDeliveryEmail) => Promise<unknown>;
  signerMessage: { subject: string; html: string };
  adminMessage: { subject: string; html: string };
  signerUserId: string | null;
};

async function cancelClaimedDelivery(
  executor: Executor,
  delivery: ClaimedDelivery,
  cancelledAt: Date,
): Promise<void> {
  await executor
    .update(legalContractDeliveryOutbox)
    .set({
      status: "cancelled",
      cancelledAt,
      recipientUserId: null,
      recipientEmail: null,
      recipientKey: sql`'retired:' || ${legalContractDeliveryOutbox.id}::text`,
      lockedAt: null,
      leaseToken: null,
      lastError: null,
      updatedAt: cancelledAt,
    })
    .where(and(
      eq(legalContractDeliveryOutbox.id, delivery.id),
      eq(legalContractDeliveryOutbox.leaseToken, delivery.leaseToken),
    ));
}

/**
 * User -> outbox is the canonical lock order shared with account erasure.
 * The provider call stays inside this bounded transaction so deletion or an
 * admin demotion cannot commit in the gap between authorization and send.
 */
async function deliverClaimedRecipient(
  delivery: ClaimedDelivery,
  prepared: PreparedDelivery,
  deliveredAt: Date,
  providerTimeoutMs?: number,
): Promise<"delivered" | "cancelled" | "lease_lost"> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    // Account erasure takes one user's UPDATE lock and then scrubs the outbox.
    // Take every identity needed for this send in deterministic UUID order,
    // before the outbox row, so signer erasure and admin deletion have a
    // single linearization point without a users/outbox deadlock.
    const userIds = [...new Set([
      prepared.signerUserId,
      delivery.recipientUserId,
    ].filter((value): value is string => Boolean(value)))].sort();
    const liveUsers = userIds.length > 0
      ? await tx
          .select({ id: users.id, email: users.email, role: users.role })
          .from(users)
          .where(inArray(users.id, userIds))
          .orderBy(asc(users.id))
          .for("share")
      : [];
    const liveUsersById = new Map(liveUsers.map((user) => [user.id, user]));

    const [current] = await tx
      .select()
      .from(legalContractDeliveryOutbox)
      .where(and(
        eq(legalContractDeliveryOutbox.id, delivery.id),
        eq(legalContractDeliveryOutbox.leaseToken, delivery.leaseToken),
        isNull(legalContractDeliveryOutbox.deliveredAt),
        isNull(legalContractDeliveryOutbox.deadLetteredAt),
        isNull(legalContractDeliveryOutbox.cancelledAt),
      ))
      .for("update")
      .limit(1);
    if (!current) return "lease_lost" as const;

    const [signerBinding] = await tx
      .select({ id: legalAcceptances.id, userId: legalAcceptances.userId })
      .from(legalAcceptances)
      .where(and(
        eq(legalAcceptances.id, current.anchorAcceptanceId),
        eq(legalAcceptances.acceptanceSessionId, current.acceptanceSessionId),
      ))
      .limit(1);
    const liveUser = current.recipientUserId
      ? liveUsersById.get(current.recipientUserId) ?? null
      : null;
    const sessionSignerLive = Boolean(
      prepared.signerUserId
      && signerBinding?.userId === prepared.signerUserId
      && liveUsersById.has(prepared.signerUserId),
    );
    const authorized = legalDeliveryRecipientIsAuthorized({
      delivery: current,
      user: liveUser,
      signerAcceptanceBound: Boolean(
        current.channel === "signer"
        && liveUser
        && signerBinding?.userId === liveUser.id,
      ),
      sessionSignerLive,
    });
    if (!authorized || !current.recipientEmail) {
      await cancelClaimedDelivery(
        executor,
        { ...current, leaseToken: delivery.leaseToken },
        deliveredAt,
      );
      return "cancelled" as const;
    }

    const message = current.channel === "signer"
      ? prepared.signerMessage
      : prepared.adminMessage;
    await sendLegalContractEmail(prepared.sendEmail, {
      to: current.recipientEmail,
      subject: message.subject,
      html: message.html,
      attachments: [prepared.attachment],
      idempotencyKey:
        `legal:${current.acceptanceSessionId}:${current.channel}:${current.recipientKey}`,
    }, providerTimeoutMs);
    return await completeDelivery(
      executor,
      { ...current, leaseToken: delivery.leaseToken },
      deliveredAt,
    )
      ? "delivered" as const
      : "lease_lost" as const;
  });
}

/**
 * Deliver every due recipient of one complete signing session. Claims and
 * outcomes are per recipient/channel: a failed admin address never causes the
 * signer or another administrator to receive the contract again.
 */
export async function processLegalContractDelivery(
  acceptanceSessionId: string,
  dependencies: ContractDeliveryDependencies = {},
): Promise<ContractDeliveryResult> {
  const now = dependencies.now?.() ?? new Date();
  await deadLetterExpiredFinalAttempts(
    now,
    acceptanceSessionId,
    dependencies.maxRecipientsPerSession ?? 100,
  );
  const claimed = await claimDueRecipients(
    acceptanceSessionId,
    now,
    dependencies.maxRecipientsPerSession,
  );
  if (!claimed.length) return currentDeliveryState(acceptanceSessionId);

  // Claim ownership covers every fallible preparation step, not just PDF
  // rendering. A failed lazy import or template render must release every
  // claimed recipient with the same durable backoff as a provider failure.
  const prepared: PreparedDelivery = await (async () => {
    try {
      const rows = await db
        .select()
        .from(legalAcceptances)
        .where(eq(legalAcceptances.acceptanceSessionId, acceptanceSessionId));
      const session = validateSignedContractSession(rows);
      const first = session[0];
      if (!first) throw new Error("contract_delivery_session_missing");
      const generatePdf = dependencies.generatePdf ?? generateSignedContractPdf;
      const pdf = await generatePdf(session);
      const { bytesToAttachment, sendEmail: defaultSendEmail } = await import(
        "@/lib/email/send"
      );
      const attachment: EmailAttachment = bytesToAttachment(
        pdf,
        signedContractPdfFilename(first),
        "application/pdf",
      );
      const sendEmail = dependencies.sendEmail ?? defaultSendEmail;
      const acceptedAt = new Date(first.acceptedAt);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
      const documents = session.map((row) => ({
        title: row.documentTitle ?? row.documentSlug,
        slug: row.documentSlug,
        version: row.documentVersion,
        contentHash: row.contentHash,
        url: `/api/legal/accept/${row.id}/copy`,
      }));
      const { signedContractEmail } = await import(
        "@/lib/email/templates/signed-contract"
      );
      const { signedContractAdminEmail } = await import(
        "@/lib/email/templates/signed-contract-admin"
      );
      const signerMessage = signedContractEmail({
        signerName: first.signatureName,
        subjectLabel: first.subjectType === "venue" ? "locația ta" : "profilul tău de artist",
        documents,
        acceptedAt,
        ipAddress: first.ipAddress,
        packVersion: first.packVersion,
        baseUrl,
        hasContractPdf: true,
        hasSignatureImage: Boolean(first.signatureImage),
      });
      const adminMessage = signedContractAdminEmail({
        signerName: first.signatureName,
        representativeRole: first.representativeRole,
        subjectType: first.subjectType === "venue" ? "venue" : "artist",
        subjectName: first.legalName,
        email: first.email,
        phone: first.phone,
        documents,
        packVersion: first.packVersion,
        locale: first.locale,
        acceptedAt,
        ipAddress: first.ipAddress,
        userAgent: first.userAgent,
        baseUrl,
        hasContractPdf: true,
        hasSignatureImage: Boolean(first.signatureImage),
      });
      return {
        attachment,
        sendEmail,
        signerMessage,
        adminMessage,
        signerUserId: first.userId ?? null,
      };
    } catch (error) {
      await Promise.all(claimed.map((delivery) => failDelivery(delivery, error, now)));
      throw new Error("contract_delivery_preparation_failed");
    }
  })();

  let failures = 0;
  for (const delivery of claimed) {
    try {
      const result = await deliverClaimedRecipient(
        delivery,
        prepared,
        dependencies.now?.() ?? new Date(),
        dependencies.providerTimeoutMs,
      );
      if (result === "lease_lost") {
        failures += 1;
      }
    } catch (error) {
      failures += 1;
      await failDelivery(delivery, error, dependencies.now?.() ?? new Date());
    }
  }
  if (failures > 0) {
    throw new Error("contract_delivery_partial_failure");
  }

  const state = await currentDeliveryState(acceptanceSessionId);
  return state === "already_delivered" ? "delivered" : state;
}

/**
 * Scheduled recovery scans due recipient rows, not sessions. Backoff and
 * dead-letter rows therefore cannot monopolize the batch or starve newer
 * contracts.
 */
export async function retryPendingLegalContractDeliveries(
  limit = 20,
  dependencies: ContractDeliveryDependencies = {},
): Promise<{
  inspected: number;
  delivered: number;
  failed: number;
  newlyDeadLettered: number;
  deadLetterBacklog: number;
}> {
  const now = dependencies.now?.() ?? new Date();
  const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
  const batchLimit = legalDeliveryBatchLimit(limit, 20);
  const newlyDeadLettered = await deadLetterExpiredFinalAttempts(
    now,
    undefined,
    batchLimit,
  );
  const jobs = await db
    .select({ sessionId: legalContractDeliveryOutbox.acceptanceSessionId })
    .from(legalContractDeliveryOutbox)
    .where(
      and(
        isNull(legalContractDeliveryOutbox.deliveredAt),
        isNull(legalContractDeliveryOutbox.deadLetteredAt),
        isNull(legalContractDeliveryOutbox.cancelledAt),
        lt(legalContractDeliveryOutbox.attempts, LEGAL_DELIVERY_MAX_ATTEMPTS),
        lte(legalContractDeliveryOutbox.nextAttemptAt, now),
        or(
          isNull(legalContractDeliveryOutbox.lockedAt),
          lt(legalContractDeliveryOutbox.lockedAt, staleBefore),
        ),
      ),
    )
    .orderBy(
      asc(legalContractDeliveryOutbox.nextAttemptAt),
      asc(legalContractDeliveryOutbox.createdAt),
      asc(legalContractDeliveryOutbox.id),
    )
    .limit(batchLimit);
  const sessionIds = [...new Set(jobs.map((job) => job.sessionId))];

  let delivered = 0;
  let failed = 0;
  for (const sessionId of sessionIds) {
    try {
      const result = await processLegalContractDelivery(sessionId, dependencies);
      if (result === "delivered" || result === "already_delivered") delivered += 1;
      else if (result === "dead_lettered") failed += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "[legal] scheduled contract delivery retry failed",
        legalContractDeliverySafeLog(error),
      );
    }
  }
  const [deadLetters] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(legalContractDeliveryOutbox)
    .where(and(
      isNull(legalContractDeliveryOutbox.deliveredAt),
      isNull(legalContractDeliveryOutbox.cancelledAt),
      eq(legalContractDeliveryOutbox.status, "dead_letter"),
    ));
  return {
    inspected: sessionIds.length,
    delivered,
    failed,
    newlyDeadLettered,
    deadLetterBacklog: deadLetters?.count ?? 0,
  };
}
