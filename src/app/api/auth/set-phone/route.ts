// Saves the user's phone number after first sign-up. No OTP — the user
// just types it in. Used by the auth-redirect phone step (especially
// for Google OAuth signups that don't carry a phone).

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const schema = z.object({
  phone: z.string().min(6).max(32),
});

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }

    // Make sure the user row exists (webhook may not have fired yet)
    let [appUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!appUser) {
      const clerkUser = await currentUser();
      if (!clerkUser) {
        return NextResponse.json({ error: "Profile load failed" }, { status: 500 });
      }
      const email = clerkUser.primaryEmailAddress?.emailAddress;
      if (!email) {
        return NextResponse.json({ error: "No email" }, { status: 400 });
      }
      const [created] = await db
        .insert(users)
        .values({
          clerkId,
          email,
          name:
            [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
            null,
          phone: parsed.data.phone,
          avatarUrl: clerkUser.imageUrl || null,
          role: "user",
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      if (!created) {
        const [refound] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
        appUser = refound;
      } else {
        appUser = created;
      }
    }

    if (!appUser) {
      return NextResponse.json({ error: "User not found" }, { status: 500 });
    }

    await db
      .update(users)
      .set({ phone: parsed.data.phone, updatedAt: new Date() })
      .where(eq(users.id, appUser.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[set-phone] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
