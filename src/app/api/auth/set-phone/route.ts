// Saves the user's phone number after first sign-up. No OTP — the user
// just types it in. Used by the auth-redirect phone step (especially
// for Google OAuth signups that don't carry a phone).

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { validatePhone } from "@/lib/phone/validate";
import { writeUserPhoneInDatabase } from "@/lib/auth/user-phone";
import { bootstrapAccountUserUnlessErased } from "@/lib/privacy/account-erasure-identity";

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

    // Country-aware format validation. Moldova (the bulk of our users)
    // requires exactly 8 digits after +373; other countries get a
    // permissive but still-bounded check.
    const result = validatePhone(parsed.data.phone);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const normalized = result.e164;

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
      const bootstrapped = await bootstrapAccountUserUnlessErased({
        clerkId,
        email,
        name:
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
          null,
        avatarUrl: clerkUser.imageUrl || null,
      });
      if (!bootstrapped) {
        return NextResponse.json(
          { error: "Account erased", code: "ACCOUNT_ERASED" },
          { status: 410 },
        );
      }
      appUser = bootstrapped;
    }

    if (!appUser) {
      return NextResponse.json({ error: "User not found" }, { status: 500 });
    }

    const phoneWrite = await writeUserPhoneInDatabase(appUser.id, normalized);
    if (!phoneWrite.ok && phoneWrite.code === "PHONE_IN_USE") {
      return NextResponse.json(
        {
          code: "phone_in_use",
          error:
            "Acest număr de telefon este deja folosit de un alt cont.",
        },
        { status: 409 },
      );
    }
    if (!phoneWrite.ok) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, phone: normalized });
  } catch (err) {
    console.error("[set-phone] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
