// GET list guests for an invitation (owner only)
// POST add a single guest

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { invitations, invitationGuests } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAppUser } from "@/lib/planner/ownership";
import { generateGuestToken, guestTokenExpiry } from "@/lib/invitations/access";
import { protectInvitationGuestRecord, revealInvitationGuestRecord } from "@/lib/privacy/guest-encryption";

async function requireOwner(id: number) {
  // `invitations.userId` is the app-user UUID — resolve from Clerk session
  // first. (Same fix as sibling routes for the INV-01 500 bug.)
  const appUser = await requireAppUser();
  if (!appUser.ok) return null;
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.userId, appUser.userId)))
    .limit(1);
  if (!row) return null;
  return { userId: appUser.userId, invitation: row };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invId = Number(id);
  const owner = await requireOwner(invId);
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guests = await db
    .select()
    .from(invitationGuests)
    .where(eq(invitationGuests.invitationId, invId));
  return NextResponse.json(guests.map(revealInvitationGuestRecord));
}

const addGuestSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  group: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invId = Number(id);
  const owner = await requireOwner(invId);
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = addGuestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // A second row for the same address is a second invitation email to the
  // same person — the exact complaint this feature set is fixing. The new
  // row would also read as never-sent, so the next bulk send would mail
  // them again even though the first row is stamped.
  const email = parsed.data.email?.trim().toLowerCase();
  if (email) {
    const existing = await db
      .select({ id: invitationGuests.id, email: invitationGuests.email })
      .from(invitationGuests)
      .where(eq(invitationGuests.invitationId, invId));
    if (
      existing
        .map(revealInvitationGuestRecord)
        .some((row) => row.email?.trim().toLowerCase() === email)
    ) {
      return NextResponse.json(
        { error: "Acest email este deja pe lista de invitați." },
        { status: 409 },
      );
    }
  }

  const [guest] = await db
    .insert(invitationGuests)
    .values(protectInvitationGuestRecord({
      invitationId: invId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      whatsapp: parsed.data.whatsapp,
      group: parsed.data.group,
      rsvpToken: generateGuestToken(),
      rsvpTokenExpiresAt: guestTokenExpiry(owner.invitation.eventDate),
    }))
    .returning();
  return NextResponse.json(revealInvitationGuestRecord(guest), { status: 201 });
}
