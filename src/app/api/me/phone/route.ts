// PUT /api/me/phone — sets the user's contact/WhatsApp phone number.
//
// This is the phone we use for WhatsApp notifications and as a fallback
// contact channel. We normalize MD-flavored inputs before saving.

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const schema = z.object({
  phone: z.string().max(32).nullable(),
});

function normalize(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("373")) return "+" + digits;
  if (digits.startsWith("0")) return "+373" + digits.slice(1);
  if (digits.length === 8) return "+373" + digits;
  return "+" + digits;
}

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

  const normalized = normalize(parsed.data.phone);

  const result = await db
    .update(users)
    .set({ phone: normalized, updatedAt: new Date() })
    .where(eq(users.clerkId, clerkId))
    .returning({ id: users.id, phone: users.phone });

  if (result.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, phone: result[0].phone });
}
