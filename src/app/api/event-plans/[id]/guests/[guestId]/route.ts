import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { guestList, invitationGuests, seatAssignments, seatingTables } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePlanOwnership } from "@/lib/planner/ownership";
import { fitsAtTable, guestHeadcount } from "@/lib/planner/guest-headcount";
import { lockSeatingPlan, tableOccupants } from "@/lib/planner/seating-capacity";
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

  return db.transaction(async (tx) => {
    if (!await lockSeatingPlan(tx, planId, owned.userId)) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    const [current] = await tx.select().from(guestList)
      .where(and(eq(guestList.id, guestIdNum), eq(guestList.planId, planId))).limit(1);
    if (!current) return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    const patch = { ...parsed.data };
    if (patch.guestType != null || patch.partySize != null) {
      const type = patch.guestType ?? current.guestType;
      patch.partySize = type === "couple" ? 2 : type === "family"
        ? Math.max(2, patch.partySize ?? current.partySize) : 1;
      patch.plusOnes = 0; // An explicit modern party edit replaces legacy +1s.
    }
    const next = { ...current, ...patch };
    if (guestHeadcount(next) > guestHeadcount(current)) {
      const [placement] = await tx.select({ tableId: seatingTables.id, seats: seatingTables.seats })
        .from(seatAssignments).innerJoin(seatingTables, eq(seatingTables.id, seatAssignments.tableId))
        .where(and(eq(seatAssignments.guestId, guestIdNum), eq(seatingTables.planId, planId))).limit(1);
      if (placement && !fitsAtTable(placement.seats, await tableOccupants(tx, planId, placement.tableId), next)) {
        return NextResponse.json({ error: "Table is full", code: "TABLE_FULL" }, { status: 400 });
      }
    }
    const [guest] = await tx.update(guestList).set(protectGuestListRecord(patch))
      .where(and(eq(guestList.id, guestIdNum), eq(guestList.planId, planId))).returning();
    return NextResponse.json({ guest: revealGuestListRecord(guest) });
  });
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

  return db.transaction(async (tx) => {
    if (!await lockSeatingPlan(tx, planId, owned.userId)) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    await tx
      .delete(guestList)
      .where(and(eq(guestList.id, guestIdNum), eq(guestList.planId, planId)));
    if (linkedInvitationGuestId) {
      await tx
        .delete(invitationGuests)
        .where(eq(invitationGuests.id, linkedInvitationGuestId));
    }
    return NextResponse.json({ ok: true });
  });
}
