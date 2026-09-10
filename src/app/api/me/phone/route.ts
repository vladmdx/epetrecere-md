// PUT /api/me/phone — sets the user's contact/WhatsApp phone number.
//
// This is the phone we use for WhatsApp notifications and as a fallback
// contact channel. We normalize MD-flavored inputs before saving.

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { validatePhone } from "@/lib/phone/validate";

const schema = z.object({
  phone: z.string().max(32).nullable(),
});

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ phone: appUser.phone });
}

export async function PUT(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const rawPhone = parsed.data.phone?.trim() || null;
  const checked = rawPhone ? validatePhone(rawPhone) : null;
  if (checked && !checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const normalized = checked?.ok ? checked.e164 : null;

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (normalized) {
    const [collision] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, normalized), ne(users.id, appUser.id)))
      .limit(1);
    if (collision) {
      return NextResponse.json(
        {
          code: "phone_in_use",
          error: "Acest număr de telefon este deja folosit de un alt cont.",
        },
        { status: 409 },
      );
    }
  }

  const result = await db
    .update(users)
    .set({ phone: normalized, updatedAt: new Date() })
    .where(eq(users.id, appUser.id))
    .returning({ id: users.id, phone: users.phone });

  if (result.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, phone: result[0].phone });
}
