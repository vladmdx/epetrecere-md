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

  const [user] = await db
    .select({
      id: users.id,
      referralCode: users.referralCode,
      referredByCode: users.referredByCode,
    })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Already captured — idempotent noop.
  if (user.referredByCode) {
    return NextResponse.json({
      ok: true,
      alreadyCaptured: true,
      code: user.referredByCode,
    });
  }

  // Self-referral guard.
  if (user.referralCode && user.referralCode.toLowerCase() === cleanCode) {
    return NextResponse.json(
      { error: "Nu te poți referi singur" },
      { status: 400 },
    );
  }

  // Verify the referrer code exists.
  const [referrer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.referralCode, cleanCode))
    .limit(1);
  if (!referrer) {
    return NextResponse.json({ error: "Cod invalid" }, { status: 404 });
  }

  await db
    .update(users)
    .set({ referredByCode: cleanCode, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true, code: cleanCode });
}
