// GET, PATCH, DELETE a single invitation (owner only)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { invitations, invitationGuests } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAppUser } from "@/lib/planner/ownership";

async function requireOwner(id: number) {
  // `invitations.userId` is the app-user UUID, not the Clerk ID — resolve
  // the Clerk session to our internal user row first or Postgres will
  // reject the FK comparison with a type error.
  const appUser = await requireAppUser();
  if (!appUser.ok) return { error: "Unauthorized" as const };
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.userId, appUser.userId)))
    .limit(1);
  if (!row) return { error: "Not found" as const };
  return { userId: appUser.userId, invitation: row };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invId = Number(id);
  const auth = await requireOwner(invId);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 404 });
  }
  const guests = await db
    .select()
    .from(invitationGuests)
    .where(eq(invitationGuests.invitationId, invId));
  return NextResponse.json({ invitation: auth.invitation, guests });
}

const patchSchema = z.object({
  status: z.enum(["draft", "published", "closed"]).optional(),
  coupleNames: z.string().optional(),
  hostName: z.string().optional(),
  eventDate: z.string().optional(),
  ceremonyTime: z.string().optional(),
  receptionTime: z.string().optional(),
  ceremonyLocation: z.string().optional(),
  receptionLocation: z.string().optional(),
  message: z.string().max(1000).optional(),
  dressCode: z.string().optional(),
  rsvpDeadline: z.string().optional(),
  allowPlusOne: z.boolean().optional(),
  coverImageUrl: z.string().optional(),
  customColors: z.record(z.string(), z.string()).optional(),
  customFonts: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invId = Number(id);
  const authResult = await requireOwner(invId);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 404 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(invitations)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(invitations.id, invId))
    .returning();
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invId = Number(id);
  const authResult = await requireOwner(invId);
  if ("error" in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: 404 });
  }
  await db.delete(invitations).where(eq(invitations.id, invId));
  return NextResponse.json({ success: true });
}
