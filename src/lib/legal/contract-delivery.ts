import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
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

const DELIVERY_LEASE_MS = 5 * 60 * 1000;

type AdminRecipient = { id: string; email: string | null };
type DeliveryEmail = {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  idempotencyKey?: string;
};

export type ContractDeliveryDependencies = {
  generatePdf?: typeof generateSignedContractPdf;
  getAdminRecipients?: () => Promise<AdminRecipient[]>;
  sendEmail?: (input: DeliveryEmail) => Promise<unknown>;
};

export type ContractDeliveryResult =
  | "delivered"
  | "already_delivered"
  | "busy"
  | "missing";

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

/**
 * Claim and deliver one complete contract. A failed render/send releases the
 * durable job for a later POST retry. Stable Resend idempotency keys prevent a
 * crash between provider acceptance and our final UPDATE from duplicating mail.
 */
export async function processLegalContractDelivery(
  acceptanceSessionId: string,
  dependencies: ContractDeliveryDependencies = {},
): Promise<ContractDeliveryResult> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
  const leaseToken = randomUUID();
  const [claimed] = await db
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
        eq(legalContractDeliveryOutbox.acceptanceSessionId, acceptanceSessionId),
        isNull(legalContractDeliveryOutbox.deliveredAt),
        or(
          isNull(legalContractDeliveryOutbox.lockedAt),
          lt(legalContractDeliveryOutbox.lockedAt, staleBefore),
        ),
      ),
    )
    .returning({ sessionId: legalContractDeliveryOutbox.acceptanceSessionId });

  if (!claimed) {
    const [existing] = await db
      .select({ deliveredAt: legalContractDeliveryOutbox.deliveredAt })
      .from(legalContractDeliveryOutbox)
      .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, acceptanceSessionId))
      .limit(1);
    if (!existing) return "missing";
    return existing.deliveredAt ? "already_delivered" : "busy";
  }

  try {
    const rows = await db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.acceptanceSessionId, acceptanceSessionId));
    const session = validateSignedContractSession(rows);
    const first = session[0];
    if (!first) throw new Error("contract_delivery_session_missing");
    const acceptedAt = new Date(first.acceptedAt);

    const generatePdf = dependencies.generatePdf ?? generateSignedContractPdf;
    const pdf = await generatePdf(session);
    const { bytesToAttachment, sendEmail: defaultSendEmail } = await import("@/lib/email/send");
    const sendEmail = dependencies.sendEmail ?? defaultSendEmail;
    const attachment = bytesToAttachment(
      pdf,
      signedContractPdfFilename(first),
      "application/pdf",
    );
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
    const documents = session.map((row) => ({
      title: row.documentTitle ?? row.documentSlug,
      slug: row.documentSlug,
      version: row.documentVersion,
      contentHash: row.contentHash,
      url: `/api/legal/accept/${row.id}/copy`,
    }));

    if (first.email) {
      const { signedContractEmail } = await import("@/lib/email/templates/signed-contract");
      const signer = signedContractEmail({
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
      await sendOrThrow(sendEmail, {
        to: first.email,
        subject: signer.subject,
        html: signer.html,
        attachments: [attachment],
        idempotencyKey: `legal:${acceptanceSessionId}:signer`,
      });
    }

    const getAdmins = dependencies.getAdminRecipients
      ?? (await import("@/lib/email/recipients")).getAdminRecipients;
    const admins = await getAdmins();
    const { signedContractAdminEmail } = await import(
      "@/lib/email/templates/signed-contract-admin"
    );
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
    for (const admin of admins) {
      if (!admin.email) continue;
      await sendOrThrow(sendEmail, {
        to: admin.email,
        subject: adminMessage.subject,
        html: adminMessage.html,
        attachments: [attachment],
        idempotencyKey: `legal:${acceptanceSessionId}:admin:${admin.id}`,
      });
    }

    const deliveredAt = new Date();
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
          eq(legalContractDeliveryOutbox.acceptanceSessionId, acceptanceSessionId),
          eq(legalContractDeliveryOutbox.leaseToken, leaseToken),
        ),
      )
      .returning({ sessionId: legalContractDeliveryOutbox.acceptanceSessionId });
    return completed ? "delivered" : "busy";
  } catch (error) {
    const failedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(legalContractDeliveryOutbox)
      .set({
        status: "failed",
        lockedAt: null,
        leaseToken: null,
        lastError: message.slice(0, 4000),
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(legalContractDeliveryOutbox.acceptanceSessionId, acceptanceSessionId),
          eq(legalContractDeliveryOutbox.leaseToken, leaseToken),
        ),
      );
    throw error;
  }
}

/**
 * Scheduled recovery for durable jobs whose request-scoped after() attempt
 * failed or never ran. Individual failures do not prevent other contracts in
 * the batch from being retried.
 */
export async function retryPendingLegalContractDeliveries(limit = 20): Promise<{
  inspected: number;
  delivered: number;
  failed: number;
}> {
  const staleBefore = new Date(Date.now() - DELIVERY_LEASE_MS);
  const jobs = await db
    .select({ sessionId: legalContractDeliveryOutbox.acceptanceSessionId })
    .from(legalContractDeliveryOutbox)
    .where(
      and(
        isNull(legalContractDeliveryOutbox.deliveredAt),
        or(
          isNull(legalContractDeliveryOutbox.lockedAt),
          lt(legalContractDeliveryOutbox.lockedAt, staleBefore),
        ),
      ),
    )
    .orderBy(asc(legalContractDeliveryOutbox.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));

  let delivered = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const result = await processLegalContractDelivery(job.sessionId);
      if (result === "delivered" || result === "already_delivered") delivered += 1;
    } catch (error) {
      failed += 1;
      console.error("[legal] scheduled contract delivery retry failed", job.sessionId, error);
    }
  }
  return { inspected: jobs.length, delivered, failed };
}
