// Public RSVP submission endpoint.
// Guest identifies themselves via a unique rsvpToken that was baked into
// their invitation link (e.g. /i/my-wedding?rsvp=abc123).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { invitationGuests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

const rsvpSchema = z.object({
  token: z.string().min(8),
  status: z.enum(["yes", "no", "maybe"]),
  plusOne: z.boolean().optional(),
  plusOneName: z.string().optional(),
  dietaryNotes: z.string().max(500).optional(),
  message: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`rsvp:${ip}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = rsvpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const [guest] = await db
    .select()
    .from(invitationGuests)
    .where(eq(invitationGuests.rsvpToken, data.token))
    .limit(1);
  if (!guest) {
    return NextResponse.json(
      { error: "Invalid RSVP token" },
      { status: 404 },
    );
  }

  const [updated] = await db
    .update(invitationGuests)
    .set({
      rsvpStatus: data.status,
      respondedAt: new Date(),
      plusOne: data.plusOne ?? false,
      plusOneName: data.plusOneName,
      dietaryNotes: data.dietaryNotes,
      message: data.message,
    })
    .where(eq(invitationGuests.id, guest.id))
    .returning();

  return NextResponse.json({
    success: true,
    guest: {
      name: updated.name,
      rsvpStatus: updated.rsvpStatus,
    },
  });
}
