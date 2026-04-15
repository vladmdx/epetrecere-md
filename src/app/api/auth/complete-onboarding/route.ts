import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/auth/complete-onboarding
 * Marks the current user's onboarding as complete (e.g. when they pick "Client").
 */
export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(users)
    .set({ onboardingComplete: true, updatedAt: new Date() })
    .where(eq(users.clerkId, clerkId));

  return NextResponse.json({ ok: true });
}
