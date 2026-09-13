import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  legalAcceptances,
  legalContractDeliveryOutbox,
} from "@/lib/db/schema";
import type { EmailAttachment } from "@/lib/email/send";
import {
  generateSignedContractPdf,
  signedContractPdfFilename,
  validateSignedContractSession,
} from "@/lib/legal/signed-contract-pdf";

export const LEGAL_DELIVERY_MAX_ATTEMPTS = 8;
const DELIVERY_LEASE_MS = 5 * 60 * 1000;
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_CAP_MS = 24 * 60 * 60 * 1000;

type DeliveryEmail = {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  idempotencyKey?: string;
};

export type ContractDeliveryDependencies = {
  generatePdf?: typeof generateSignedContractPdf;
  sendEmail?: (input: DeliveryEmail) => Promise<unknown>;
  now?: () => Date;
};

export type ContractDeliveryResult =
  | "delivered"
  | "already_delivered"
  | "dead_lettered"
  | "busy"
  | "missing";

type ClaimedDelivery = typeof legalContractDeliveryOutbox.$inferSelect & {
  leaseToken: string;
};

function providerError(result: unknown): unknown {
  if (!result || typeof result !== "object") return null;
  return "error" in result ? (result as { error?: unknown }).error : null;
}

async function sendOrThrow(
  sendEmail: (input: DeliveryEmail) => Promise<unknown>,
  input: DeliveryEmail,
): Promise<void> {
  const result = await sendEmail(input);
  const error = providerError(result);
  if (error) {
    throw new Error(`contract_email_provider_error: ${JSON.stringify(error)}`);
  }
}

/** Exponential retry with a finite cap; exported for deterministic tests. */
export function legalContractRetryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 20));
  return Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_CAP_MS);
}

/**
 * A worker can disappear after incrementing the final attempt but before it
 * records failure. Once that lease expires, close the row explicitly instead
 * of leaving a permanent `processing` job that can never be claimed again.
 */
async function deadLetterExpiredFinalAttempts(
  now: Date,
  acceptanceSessionId?: string,
): Promise<void> {
  const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
  await db
    .update(legalContractDeliveryOutbox)
    .set({
      status: "dead_letter",
      lockedAt: null,
      leaseToken: null,
      deadLetteredAt: now,
      lastError: sql`coalesce(${legalContractDeliveryOutbox.lastError}, 'delivery lease expired after maximum attempts')`,
      updatedAt: now,
    })
    .where(and(
      acceptanceSessionId
        ? eq(legalContractDeliveryOutbox.acceptanceSessionId, acceptanceSessionId)
        : undefined,
      isNull(legalContractDeliveryOutbox.deliveredAt),
      isNull(legalContractDeliveryOutbox.deadLetteredAt),
      gte(legalContractDeliveryOutbox.attempts, LEGAL_DELIVERY_MAX_ATTEMPTS),
      or(
        isNull(legalContractDeliveryOutbox.lockedAt),
        lt(legalContractDeliveryOutbox.lockedAt, staleBefore),
      ),
    ));
}

async function claimDueRecipients(
  acceptanceSessionId: string,
  now: Date,
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
    .limit(100);

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
  const message = error instanceof Error ? error.message : String(error);
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
      lastError: message.slice(0, 4000),
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
  delivery: ClaimedDelivery,
  deliveredAt: Date,
): Promise<boolean> {
  const [completed] = await db
    .update(legalContractDeliveryOutbox)
    .set({
      status: "delivered",
      deliveredAt,
      lockedAt: null,
      leaseToken: null,
      lastError: null,
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
    })
    .from(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, acceptanceSessionId));
  if (!rows.length) return "missing";
  if (rows.every((row) => row.deliveredAt)) return "already_delivered";
  if (rows.some((row) => row.deadLetteredAt)) return "dead_lettered";
  return "busy";
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
  await deadLetterExpiredFinalAttempts(now, acceptanceSessionId);
  const claimed = await claimDueRecipients(acceptanceSessionId, now);
  if (!claimed.length) return currentDeliveryState(acceptanceSessionId);

  // Claim ownership covers every fallible preparation step, not just PDF
  // rendering. A failed lazy import or template render must release every
  // claimed recipient with the same durable backoff as a provider failure.
  const prepared = await (async () => {
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
      return { attachment, sendEmail, signerMessage, adminMessage };
    } catch (error) {
      await Promise.all(claimed.map((delivery) => failDelivery(delivery, error, now)));
      throw error;
    }
  })();

  const errors: unknown[] = [];
  for (const delivery of claimed) {
    try {
      const message = delivery.channel === "signer"
        ? prepared.signerMessage
        : prepared.adminMessage;
      await sendOrThrow(prepared.sendEmail, {
        to: delivery.recipientEmail,
        subject: message.subject,
        html: message.html,
        attachments: [prepared.attachment],
        idempotencyKey:
          `legal:${acceptanceSessionId}:${delivery.channel}:${delivery.recipientKey}`,
      });
      if (!await completeDelivery(delivery, dependencies.now?.() ?? new Date())) {
        errors.push(new Error(`contract_delivery_lease_lost:${delivery.id}`));
      }
    } catch (error) {
      errors.push(error);
      await failDelivery(delivery, error, dependencies.now?.() ?? new Date());
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "contract_delivery_partial_failure");
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
): Promise<{ inspected: number; delivered: number; failed: number }> {
  const now = dependencies.now?.() ?? new Date();
  const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
  await deadLetterExpiredFinalAttempts(now);
  const jobs = await db
    .select({ sessionId: legalContractDeliveryOutbox.acceptanceSessionId })
    .from(legalContractDeliveryOutbox)
    .where(
      and(
        isNull(legalContractDeliveryOutbox.deliveredAt),
        isNull(legalContractDeliveryOutbox.deadLetteredAt),
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
    .limit(Math.max(1, Math.min(limit, 100)));
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
      console.error("[legal] scheduled contract delivery retry failed", sessionId, error);
    }
  }
  return { inspected: sessionIds.length, delivered, failed };
}
