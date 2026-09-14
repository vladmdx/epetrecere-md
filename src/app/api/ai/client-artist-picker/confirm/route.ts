import { after, NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { eventPlans, users } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import {
  AiBookingProposalError,
  aiBookingProposalActionId,
  findAiBookingProposalTarget,
} from "@/lib/booking/ai-booking-proposal";
import { buildAiBookingPayload } from "@/lib/booking/ai-booking-payload";
import {
  ArtistAvailabilityWriteError,
  BookingClientIdentityError,
  BookingEventDateWriteError,
  BookingPartnerAccountError,
  BookingTargetUnavailableError,
  createClientBookingRequest,
} from "@/lib/booking/client-booking-create";
import {
  BookingCreationActorNotFoundError,
  BookingCreationIdempotencyConflictError,
  EventPlanBookingWriteError,
} from "@/lib/booking/booking-request-write";
import { PlanBookingConflictError } from "@/lib/booking/plan-booking-constraints";
import { formatConflictMessage } from "@/lib/booking/availability";
import { dispatchBookingCreationEffects } from "@/lib/booking/booking-create-effects";

export const runtime = "nodejs";

const confirmSchema = z
  .object({
    eventPlanId: z.number().int().positive().max(2_147_483_647),
    proposalToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

const SAFE_CONFIRM_ERROR_CODES = new Set([
  "AI_PROPOSAL_INVALID",
  "AI_PROPOSAL_EXPIRED",
  "AI_PROPOSAL_MISMATCH",
  "AI_PROPOSAL_ALREADY_USED",
  "IDEMPOTENCY_KEY_REUSED",
  "PLAN_BOOKING_CONFLICT",
  "ARTIST_UNAVAILABLE",
  "CLIENT_PHONE_REQUIRED",
  "EVENT_DATE_IN_PAST",
  "PARTNER_ACCOUNT_FORBIDDEN",
  "BOOKING_TARGET_NOT_FOUND",
  "CLIENT_ACCOUNT_NOT_FOUND",
  "EVENT_PLAN_NOT_FOUND",
  // Explicit PostgreSQL SQLSTATE allowlist. Never log arbitrary driver codes.
  "23502",
  "23503",
  "23505",
  "23514",
  "40001",
  "40P01",
  "55P03",
  "57014",
]);

function safeErrorClass(error: unknown): string {
  try {
    const value = error instanceof Error ? error.name : null;
    return typeof value === "string"
      && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)
      ? value
      : "UnknownError";
  } catch {
    return "UnknownError";
  }
}

function safeConfirmErrorLog(error: unknown, correlationId: string) {
  let rawCode: string | null = null;
  try {
    const candidate = typeof error === "object" && error !== null
      ? (error as { code?: unknown }).code
      : null;
    rawCode = typeof candidate === "string" ? candidate : null;
  } catch {
    rawCode = null;
  }
  const safeCode = rawCode && SAFE_CONFIRM_ERROR_CODES.has(rawCode)
    ? rawCode
    : undefined;
  return {
    correlationId,
    errorClass: safeErrorClass(error),
    ...(safeCode ? { code: safeCode } : {}),
  };
}

function expectedFailure(error: unknown): {
  status: number;
  code: string;
  message: string;
} | null {
  if (error instanceof AiBookingProposalError) {
    return {
      status: error.status,
      code: error.code,
      message:
        "Propunerea a expirat, a fost deja folosită sau datele planului s-au schimbat. Cere asistentului o propunere nouă.",
    };
  }
  if (error instanceof BookingCreationIdempotencyConflictError) {
    return {
      status: error.status,
      code: error.code,
      message:
        "Această confirmare nu mai corespunde cererii inițiale. Cere o propunere nouă.",
    };
  }
  if (error instanceof PlanBookingConflictError) {
    return { status: 409, code: "PLAN_BOOKING_CONFLICT", message: error.message };
  }
  if (error instanceof ArtistAvailabilityWriteError) {
    return {
      status: 409,
      code: "ARTIST_UNAVAILABLE",
      message: formatConflictMessage(error.result),
    };
  }
  if (error instanceof BookingClientIdentityError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof BookingEventDateWriteError) {
    return {
      status: error.status,
      code: error.code,
      message: "Data evenimentului este în trecut.",
    };
  }
  if (error instanceof BookingPartnerAccountError) {
    return { status: error.status, code: "PARTNER_ACCOUNT_FORBIDDEN", message: error.message };
  }
  if (error instanceof BookingTargetUnavailableError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof BookingCreationActorNotFoundError) {
    return { status: error.status, code: "CLIENT_ACCOUNT_NOT_FOUND", message: error.message };
  }
  if (error instanceof EventPlanBookingWriteError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return null;
}

/**
 * The only AI-proposal mutation boundary. No LLM or browser-supplied
 * transcript participates in authorization: the authenticated user clicks a
 * server-rendered proposal card and this endpoint consumes that exact nonce.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(
    `ai-client-confirm:${clerkId}`,
    30,
    60 * 60 * 1000,
  );
  if (!limited.success) {
    return NextResponse.json(
      { error: "Prea multe confirmări. Încearcă din nou mai târziu." },
      { status: 429 },
    );
  }
  const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Propunerea nu are un format valid.",
        code: "AI_PROPOSAL_INVALID",
      },
      { status: 400 },
    );
  }

  const [appUser] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const target = await findAiBookingProposalTarget({
      token: parsed.data.proposalToken,
      userId: appUser.id,
      eventPlanId: parsed.data.eventPlanId,
    });
    const [plan] = await db
      .select({
        id: eventPlans.id,
        title: eventPlans.title,
        eventType: eventPlans.eventType,
        eventDate: eventPlans.eventDate,
        guestCountTarget: eventPlans.guestCountTarget,
      })
      .from(eventPlans)
      .where(and(
        eq(eventPlans.id, parsed.data.eventPlanId),
        eq(eventPlans.userId, appUser.id),
      ))
      .limit(1);
    if (!plan) throw new EventPlanBookingWriteError();

    const booking = buildAiBookingPayload({
      plan,
      actor: appUser,
      artistId: target.artistId,
    });
    if (!booking) {
      return NextResponse.json(
        {
          error: "Adaugă data evenimentului înainte de confirmare.",
          code: "EVENT_DATE_REQUIRED",
        },
        { status: 400 },
      );
    }

    const creation = await createClientBookingRequest({
      booking,
      actorUserId: appUser.id,
      clerkId,
      idempotencyKey: aiBookingProposalActionId(parsed.data.proposalToken),
      requiredArtistCategoryId: target.categoryId,
      aiProposalToken: parsed.data.proposalToken,
    });
    after(() => dispatchBookingCreationEffects(creation));
    return NextResponse.json(
      {
        ok: true,
        created: creation.created,
        bookingRequestId: creation.booking.id,
        artistId: target.artistId,
        categoryId: target.categoryId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const failure = expectedFailure(error);
    if (failure) {
      return NextResponse.json(
        { error: failure.message, code: failure.code },
        { status: failure.status },
      );
    }
    const correlationId = randomUUID();
    console.error(
      "[ai/client-artist-picker/confirm] failed",
      safeConfirmErrorLog(error, correlationId),
    );
    return NextResponse.json(
      {
        error: "Cererea nu a putut fi trimisă. Încearcă din nou.",
        correlationId,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Correlation-Id": correlationId,
        },
      },
    );
  }
}
