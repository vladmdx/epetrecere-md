import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { guestList, invitationGuests } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import {
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

// M4 — PATCH / DELETE /api/event-plans/[id]/guests/[guestId]

const patchGuestSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  group: z.string().optional().nullable(),
  guestType: z.enum(["single", "couple", "family"]).optional(),
  partySize: z.number().int().min(1).max(8).optional(),
  kidsCount: z.number().int().min(0).max(20).optional(),
  contactChannel: z
    .enum(["email", "sms", "whatsapp", "viber", "telegram"])
    .optional(),
  contactValue: z.string().optional().nullable(),
  plusOnes: z.number().int().min(0).max(20).optional(),
  rsvp: z.enum(["pending", "accepted", "declined", "maybe"]).optional(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const { id, guestId } = await params;
  const planId = Number(id);
  const guestIdNum = Number(guestId);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchGuestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [guest] = await db
    .update(guestList)
    .set(protectGuestListRecord(parsed.data))
    .where(and(eq(guestList.id, guestIdNum), eq(guestList.planId, planId)))
    .returning();

  if (!guest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  return NextResponse.json({ guest: revealGuestListRecord(guest) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const { id, guestId } = await params;
  const planId = Number(id);
  const guestIdNum = Number(guestId);

  const owned = await requirePlanOwnership(planId);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }

  const [storedPlannerGuest] = await db
    .select()
    .from(guestList)
    .where(and(eq(guestList.id, guestIdNum), eq(guestList.planId, planId)))
    .limit(1);
  if (!storedPlannerGuest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  let linkedInvitationGuestId: number | null = null;
  if (owned.plan.invitationId) {
    const rows = await db
      .select()
      .from(invitationGuests)
      .where(eq(invitationGuests.invitationId, owned.plan.invitationId));
    const wanted = contactKey(revealGuestListRecord(storedPlannerGuest));
    linkedInvitationGuestId =
      rows.find(
        (row) => contactKey(revealInvitationGuestRecord(row)) === wanted,
      )?.id ?? null;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(guestList)
      .where(and(eq(guestList.id, guestIdNum), eq(guestList.planId, planId)));
    if (linkedInvitationGuestId) {
      await tx
        .delete(invitationGuests)
        .where(eq(invitationGuests.id, linkedInvitationGuestId));
    }
  });

  return NextResponse.json({ ok: true });
}
