// POST /api/referrals/capture
//
// Called by client code when a signed-in user first lands with ?ref=xxx
// in the URL. We store the referral code on their user row (one-shot —
// immutable after first set so users can't game it by re-visiting with
// a different code). Also self-rejects if someone tries to refer
// themselves.
//
// Does NOT credit the referrer — that happens later via
// /api/referrals/trigger when the referred user hits a milestone
// (onboarding complete, first booking).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { captureReferralAttribution } from "@/lib/referrals/capture";

const schema = z.object({
  code: z.string().min(3).max(24),
});

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const cleanCode = parsed.data.code.trim().toLowerCase();

  const [userCandidate] = await db
    .select({
      id: users.id,
      referralCode: users.referralCode,
    })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!userCandidate) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (
    userCandidate.referralCode &&
    userCandidate.referralCode.toLowerCase() === cleanCode
  ) {
    return NextResponse.json(
      { error: "Nu te poți referi singur" },
      { status: 400 },
    );
  }

  // Verify the referrer code exists.
  const [referrerCandidate] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.referralCode, cleanCode))
    .limit(1);
  if (!referrerCandidate) {
    return NextResponse.json({ error: "Cod invalid" }, { status: 404 });
  }

  const result = await db.transaction((tx) =>
    captureReferralAttribution(tx as unknown as typeof db, {
      userId: userCandidate.id,
      clerkId,
      referrerId: referrerCandidate.id,
      cleanCode,
    }),
  );

  if (result.status === "captured") {
    return NextResponse.json({ ok: true, code: result.code });
  }
  if (result.status === "already_captured") {
    return NextResponse.json({
      ok: true,
      alreadyCaptured: true,
      code: result.code,
    });
  }
  if (result.status === "user_not_found") {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (result.status === "referrer_invalid") {
    return NextResponse.json({ error: "Cod invalid" }, { status: 404 });
  }
  if (result.status === "cycle") {
    return NextResponse.json(
      { error: "Lanț de recomandare invalid", code: "REFERRAL_CYCLE" },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: "Atribuirea nu a putut fi salvată" },
    { status: 409 },
  );
}
