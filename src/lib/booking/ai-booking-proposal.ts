import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiBookingProposals } from "@/lib/db/schema";
import type { BookingRequestWriteTx } from "./booking-request-write";
import {
  aiBookingPayloadFingerprintFromPersistedBooking,
  type PersistedAiBookingSnapshot,
} from "./ai-booking-payload";

const PROPOSAL_TTL_MS = 15 * 60 * 1000;
const EXPIRED_RETENTION_MS = 24 * 60 * 60 * 1000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function validRawToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/**
 * The database stores neither the raw token nor a guessable hash of the
 * booking's contact fields. Possession of the random token is required to
 * recompute this binding.
 */
export function aiBookingProposalPayloadHash(
  token: string,
  payloadFingerprint: string,
): string {
  if (!validRawToken(token) || !/^[0-9a-f]{64}$/.test(payloadFingerprint)) {
    throw new AiBookingProposalError("AI_PROPOSAL_INVALID");
  }
  return createHmac("sha256", token)
    .update("epetrecere:ai-booking-proposal-payload:v1\0", "utf8")
    .update(payloadFingerprint, "utf8")
    .digest("hex");
}

/** Stable idempotency UUID for retries of this exact opaque proposal. */
export function aiBookingProposalActionId(token: string): string {
  if (!validRawToken(token)) {
    throw new AiBookingProposalError("AI_PROPOSAL_INVALID");
  }
  const bytes = createHash("sha256")
    .update("epetrecere:ai-booking-proposal-action:v1\0", "utf8")
    .update(token, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sameHash(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export class AiBookingProposalError extends Error {
  readonly status = 409;

  constructor(
    readonly code:
      | "AI_PROPOSAL_INVALID"
      | "AI_PROPOSAL_EXPIRED"
      | "AI_PROPOSAL_MISMATCH"
      | "AI_PROPOSAL_ALREADY_USED",
  ) {
    super(code);
    this.name = "AiBookingProposalError";
  }
}

export type AiBookingProposalTuple = {
  userId: string;
  eventPlanId: number;
  artistId: number;
  categoryId: number;
  payloadHash: string;
  actionId: string;
};

export function aiBookingProposalDecision(
  proposal: {
    userId: string;
    eventPlanId: number;
    artistId: number;
    categoryId: number;
    payloadHash: string;
    expiresAt: Date;
    consumedAt: Date | null;
    consumedActionId: string | null;
  } | null,
  input: AiBookingProposalTuple,
  now: Date,
): "consume" {
  if (!proposal) throw new AiBookingProposalError("AI_PROPOSAL_INVALID");
  if (
    proposal.userId !== input.userId
    || proposal.eventPlanId !== input.eventPlanId
    || proposal.artistId !== input.artistId
    || proposal.categoryId !== input.categoryId
    || !sameHash(proposal.payloadHash, input.payloadHash)
  ) {
    throw new AiBookingProposalError("AI_PROPOSAL_MISMATCH");
  }
  if (proposal.expiresAt.getTime() <= now.getTime()) {
    throw new AiBookingProposalError("AI_PROPOSAL_EXPIRED");
  }
  if (proposal.consumedActionId) {
    throw new AiBookingProposalError("AI_PROPOSAL_ALREADY_USED");
  }
  return "consume";
}

export function aiBookingProposalReplayDecision(
  proposal: {
    userId: string;
    eventPlanId: number;
    artistId: number;
    categoryId: number;
    payloadHash: string;
    consumedAt: Date | null;
    consumedActionId: string | null;
  } | null,
  input: AiBookingProposalTuple,
): "replay" {
  if (!proposal) throw new AiBookingProposalError("AI_PROPOSAL_INVALID");
  if (
    proposal.userId !== input.userId
    || proposal.eventPlanId !== input.eventPlanId
    || proposal.artistId !== input.artistId
    || proposal.categoryId !== input.categoryId
    || !sameHash(proposal.payloadHash, input.payloadHash)
  ) {
    throw new AiBookingProposalError("AI_PROPOSAL_MISMATCH");
  }
  if (
    !proposal.consumedAt
    || proposal.consumedActionId !== input.actionId
  ) {
    throw new AiBookingProposalError("AI_PROPOSAL_ALREADY_USED");
  }
  return "replay";
}

export async function issueAiBookingProposal(input: {
  userId: string;
  eventPlanId: number;
  artistId: number;
  categoryId: number;
  payloadFingerprint: string;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + PROPOSAL_TTL_MS);
  const token = randomBytes(32).toString("base64url");

  // Cleanup commits before the FK-bearing insert. Keeping both in one
  // transaction would hold proposal-row locks and then request artist/
  // category parent locks, the reverse of confirmation and admin deletion.
  await db.execute(sql`
    DELETE FROM ${aiBookingProposals}
    WHERE ${aiBookingProposals.id} IN (
      SELECT ${aiBookingProposals.id}
      FROM ${aiBookingProposals}
      WHERE ${aiBookingProposals.expiresAt} < ${new Date(now.getTime() - EXPIRED_RETENTION_MS)}
      ORDER BY ${aiBookingProposals.expiresAt}, ${aiBookingProposals.id}
      LIMIT 1000
    )
  `);
  await db.insert(aiBookingProposals).values({
    tokenHash: tokenHash(token),
    userId: input.userId,
    eventPlanId: input.eventPlanId,
    artistId: input.artistId,
    categoryId: input.categoryId,
    payloadHash: aiBookingProposalPayloadHash(token, input.payloadFingerprint),
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Consume inside the booking-create transaction, after actor + plan locks and
 * before any availability/financial writes. Rollback restores the proposal.
 */
export async function consumeAiBookingProposal(
  tx: BookingRequestWriteTx,
  input: {
    token: string;
    userId: string;
    eventPlanId: number;
    artistId: number;
    categoryId: number;
    payloadFingerprint: string;
    actionId: string;
    now?: Date;
  },
): Promise<void> {
  if (!validRawToken(input.token)) {
    throw new AiBookingProposalError("AI_PROPOSAL_INVALID");
  }
  const now = input.now ?? new Date();
  const [proposal] = await tx
    .select()
    .from(aiBookingProposals)
    .where(eq(aiBookingProposals.tokenHash, tokenHash(input.token)))
    .for("update")
    .limit(1);
  aiBookingProposalDecision(
    proposal ?? null,
    {
      ...input,
      payloadHash: aiBookingProposalPayloadHash(
        input.token,
        input.payloadFingerprint,
      ),
    },
    now,
  );

  const [consumed] = await tx
    .update(aiBookingProposals)
    .set({ consumedAt: now, consumedActionId: input.actionId })
    .where(and(
      eq(aiBookingProposals.id, proposal.id),
      isNull(aiBookingProposals.consumedAt),
      isNull(aiBookingProposals.consumedActionId),
    ))
    .returning({ id: aiBookingProposals.id });
  if (!consumed) {
    throw new AiBookingProposalError("AI_PROPOSAL_ALREADY_USED");
  }
}

/**
 * Lost-response replay authorization. This intentionally ignores expiry only
 * after proving that the token was consumed by the same action and payload;
 * it can never authorize a new booking.
 */
export async function verifyConsumedAiBookingProposalReplay(
  tx: BookingRequestWriteTx,
  input: {
    token: string;
    userId: string;
    eventPlanId: number;
    artistId: number;
    categoryId: number;
    actionId: string;
    booking: PersistedAiBookingSnapshot;
  },
): Promise<void> {
  if (!validRawToken(input.token)) {
    throw new AiBookingProposalError("AI_PROPOSAL_INVALID");
  }
  const [proposal] = await tx
    .select()
    .from(aiBookingProposals)
    .where(eq(aiBookingProposals.tokenHash, tokenHash(input.token)))
    .for("update")
    .limit(1);
  if (
    input.booking.clientUserId !== input.userId
    || input.booking.eventPlanId !== input.eventPlanId
    || input.booking.artistId !== input.artistId
    || input.booking.venueId !== null
    || input.booking.hallId !== null
    || input.booking.reservationScope !== null
  ) {
    throw new AiBookingProposalError("AI_PROPOSAL_MISMATCH");
  }
  aiBookingProposalReplayDecision(proposal ?? null, {
    ...input,
    payloadHash: aiBookingProposalPayloadHash(
      input.token,
      aiBookingPayloadFingerprintFromPersistedBooking(input.booking),
    ),
  });
}

/**
 * Resolve only the server-bound target needed by the direct confirmation
 * endpoint. The later booking transaction performs the authoritative lock,
 * payload comparison and one-time consumption.
 */
export async function findAiBookingProposalTarget(input: {
  token: string;
  userId: string;
  eventPlanId: number;
  now?: Date;
}): Promise<{ artistId: number; categoryId: number }> {
  if (!validRawToken(input.token)) {
    throw new AiBookingProposalError("AI_PROPOSAL_INVALID");
  }
  const [proposal] = await db
    .select({
      userId: aiBookingProposals.userId,
      eventPlanId: aiBookingProposals.eventPlanId,
      artistId: aiBookingProposals.artistId,
      categoryId: aiBookingProposals.categoryId,
      expiresAt: aiBookingProposals.expiresAt,
      consumedAt: aiBookingProposals.consumedAt,
    })
    .from(aiBookingProposals)
    .where(eq(aiBookingProposals.tokenHash, tokenHash(input.token)))
    .limit(1);
  if (
    !proposal
    || proposal.userId !== input.userId
    || proposal.eventPlanId !== input.eventPlanId
  ) {
    throw new AiBookingProposalError("AI_PROPOSAL_INVALID");
  }
  if (
    !proposal.consumedAt
    && proposal.expiresAt.getTime() <= (input.now ?? new Date()).getTime()
  ) {
    throw new AiBookingProposalError("AI_PROPOSAL_EXPIRED");
  }
  return { artistId: proposal.artistId, categoryId: proposal.categoryId };
}
