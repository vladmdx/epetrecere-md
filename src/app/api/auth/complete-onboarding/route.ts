import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { triggerReferral } from "@/lib/referrals/trigger";

/**
 * POST /api/auth/complete-onboarding
 * Marks the current user's onboarding as complete (e.g. when they pick "Client").
 * Also fires the `onboarded` referral milestone if the user signed up with
 * a referral code — non-blocking.
 */
export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [updated] = await db
    .update(users)
    .set({ onboardingComplete: true, updatedAt: new Date() })
    .where(eq(users.clerkId, clerkId))
    .returning({ id: users.id });

  if (updated) {
    void triggerReferral(updated.id, "onboarded").catch((err) => {
      console.error("[referral] onboarded trigger failed", err);
    });
  }

  return NextResponse.json({ ok: true });
}
