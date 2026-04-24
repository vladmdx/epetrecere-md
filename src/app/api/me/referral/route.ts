// GET /api/me/referral
//
// Returns the signed-in user's referral code (generating one lazily on
// first access), their total earned credit, and a list of users they
// referred with their current milestone status.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, referralEvents } from "@/lib/db/schema";
import { buildReferralCode } from "@/lib/referrals/code";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      referralCode: users.referralCode,
      referralCreditCents: users.referralCreditCents,
    })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Lazily assign a code if they don't have one yet. Retry on unique-index
  // collisions (shouldn't happen in practice with ~32^4 = 1M tail space).
  let code = user.referralCode;
  if (!code) {
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = buildReferralCode(user.name || user.email);
      try {
        await db
          .update(users)
          .set({ referralCode: candidate })
          .where(eq(users.id, user.id));
        code = candidate;
      } catch {
        // collision — try again with a new tail
      }
    }
    if (!code) {
      return NextResponse.json(
        { error: "Could not generate code" },
        { status: 500 },
      );
    }
  }

  // List referred users via the events table (one row per milestone).
  // We group in JS so we return one entry per referred user with all
  // milestones they've hit.
  const events = await db
    .select({
      id: referralEvents.id,
      referredUserId: referralEvents.referredUserId,
      eventType: referralEvents.eventType,
      creditCents: referralEvents.creditCents,
      createdAt: referralEvents.createdAt,
      referredName: users.name,
      referredEmail: users.email,
    })
    .from(referralEvents)
    .leftJoin(users, eq(users.id, referralEvents.referredUserId))
    .where(eq(referralEvents.referrerUserId, user.id))
    .orderBy(desc(referralEvents.createdAt));

  const byUser = new Map<
    string,
    {
      referredUserId: string;
      name: string | null;
      email: string | null;
      milestones: Array<{
        eventType: string;
        creditCents: number;
        createdAt: string;
      }>;
      totalCredit: number;
    }
  >();
  for (const e of events) {
    const existing = byUser.get(e.referredUserId);
    const milestone = {
      eventType: e.eventType,
      creditCents: e.creditCents,
      createdAt: e.createdAt.toISOString(),
    };
    if (existing) {
      existing.milestones.push(milestone);
      existing.totalCredit += e.creditCents;
    } else {
      byUser.set(e.referredUserId, {
        referredUserId: e.referredUserId,
        name: e.referredName,
        email: e.referredEmail,
        milestones: [milestone],
        totalCredit: e.creditCents,
      });
    }
  }

  return NextResponse.json({
    code,
    shareUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://epetrecere.md"}/?ref=${code}`,
    creditCents: user.referralCreditCents,
    creditEur: user.referralCreditCents / 100,
    referred: Array.from(byUser.values()),
  });
}
