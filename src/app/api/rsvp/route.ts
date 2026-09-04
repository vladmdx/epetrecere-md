// Public RSVP submission endpoint.
// Guest identifies themselves via a unique rsvpToken that was baked into
// their invitation link (e.g. /i/my-wedding?rsvp=abc123).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPlans, guestList, invitationGuests } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";
import { isGuestTokenActive } from "@/lib/invitations/access";
import {
  protectInvitationGuestRecord,
  protectGuestListRecord,
  revealGuestListRecord,
  revealInvitationGuestRecord,
} from "@/lib/privacy/guest-encryption";

function contactKey(row: {
  name?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const email = row.email?.trim().toLowerCase();
  if (email) return `e:${email}`;
  const phone = row.phone?.replace(/\D/g, "");
  if (phone) return `p:${phone}`;
  return `n:${(row.name ?? row.fullName ?? "").trim().toLowerCase()}`;
}

const rsvpSchema = z.object({
  token: z.string().min(8),
  status: z.enum(["yes", "no", "maybe"]),
  plusOne: z.boolean().optional(),
  plusOneName: z.string().optional(),
  dietaryNotes: z.string().max(500).optional(),
  dietaryConsent: z.boolean().optional(),
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
  if (!isGuestTokenActive(guest)) {
    return NextResponse.json(
      { error: "Linkul RSVP a expirat sau a fost revocat." },
      { status: 410 },
    );
  }

  const dietaryNotes = data.dietaryNotes?.trim() || null;
  if (dietaryNotes && data.dietaryConsent !== true) {
    return NextResponse.json(
      { error: "Este necesar acordul explicit pentru informațiile despre alergii." },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(invitationGuests)
    .set(protectInvitationGuestRecord({
      rsvpStatus: data.status,
      respondedAt: new Date(),
      plusOne: data.plusOne ?? false,
      plusOneName: data.plusOneName,
      dietaryNotes,
      dietaryConsentAt: dietaryNotes ? new Date() : null,
      message: data.message,
    }))
    .where(eq(invitationGuests.id, guest.id))
    .returning();

  // Keep the planner view in step with the electronic invitation. The two
  // modules pre-date one another and have no direct guest FK, so reconcile
  // only within this invitation's linked plan using the same contact identity.
  const [linkedPlan] = await db
    .select({ id: eventPlans.id })
    .from(eventPlans)
    .where(eq(eventPlans.invitationId, guest.invitationId))
    .limit(1);
  if (linkedPlan) {
    const plannerRows = await db
      .select()
      .from(guestList)
      .where(eq(guestList.planId, linkedPlan.id));
    const wanted = contactKey(revealInvitationGuestRecord(guest));
    const plannerGuest = plannerRows.find(
      (row) => contactKey(revealGuestListRecord(row)) === wanted,
    );
    if (plannerGuest) {
      const rsvp = data.status === "yes"
        ? "accepted"
        : data.status === "no"
          ? "declined"
          : "maybe";
      await db
        .update(guestList)
        .set(protectGuestListRecord({ rsvp, dietary: dietaryNotes }))
        .where(eq(guestList.id, plannerGuest.id));
    }
  }

  return NextResponse.json({
    success: true,
    guest: {
      name: revealInvitationGuestRecord(updated).name,
      rsvpStatus: updated.rsvpStatus,
    },
  });
}

/** A guest needs no account to erase the record behind their private link.
 * The same person is removed from the linked planner list as well, so a
 * deletion is not cosmetic while a second plaintext/encrypted row survives. */
export async function DELETE(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`rsvp-delete:${ip}`, 10, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = z.object({ token: z.string().min(8) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const [storedGuest] = await db
    .select()
    .from(invitationGuests)
    .where(eq(invitationGuests.rsvpToken, parsed.data.token))
    .limit(1);
  if (!storedGuest) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  const guest = revealInvitationGuestRecord(storedGuest);
  const [plan] = await db
    .select({ id: eventPlans.id })
    .from(eventPlans)
    .where(eq(eventPlans.invitationId, storedGuest.invitationId))
    .limit(1);

  const matchingPlannerIds: number[] = [];
  if (plan) {
    const plannerRows = await db
      .select()
      .from(guestList)
      .where(eq(guestList.planId, plan.id));
    const key = contactKey(guest);
    for (const storedPlannerGuest of plannerRows) {
      if (contactKey(revealGuestListRecord(storedPlannerGuest)) === key) {
        matchingPlannerIds.push(storedPlannerGuest.id);
      }
    }
  }

  await db.transaction(async (tx) => {
    if (matchingPlannerIds.length > 0) {
      await tx.delete(guestList).where(inArray(guestList.id, matchingPlannerIds));
    }
    await tx
      .delete(invitationGuests)
      .where(eq(invitationGuests.id, storedGuest.id));
  });

  return NextResponse.json({ success: true });
}
