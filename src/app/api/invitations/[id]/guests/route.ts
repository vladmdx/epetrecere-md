// GET list guests for an invitation (owner only)
// POST add a single guest

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { invitations, invitationGuests } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAppUser } from "@/lib/planner/ownership";

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

function genToken(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
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
  return NextResponse.json(guests);
}

const addGuestSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
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

  const [guest] = await db
    .insert(invitationGuests)
    .values({
      invitationId: invId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      group: parsed.data.group,
      rsvpToken: genToken(),
    })
    .returning();
  return NextResponse.json(guest, { status: 201 });
}
