import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads, leadActivities } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET single lead with activities
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, Number(id)))
    .limit(1);

  if (!lead) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const activities = await db
    .select()
    .from(leadActivities)
    .where(eq(leadActivities.leadId, Number(id)))
    .orderBy(desc(leadActivities.createdAt));

  return NextResponse.json({ ...lead, activities });
}

// PATCH — update lead fields (status, assignedTo, etc.)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    "name", "phone", "email", "eventType", "eventDate",
    "location", "guestCount", "budget", "message", "status", "score",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  // If status changed, log activity
  if (updates.status) {
    await db.insert(leadActivities).values({
      leadId: Number(id),
      type: "status_change",
      content: `Status schimbat la: ${updates.status}`,
    });
  }

  updates.updatedAt = new Date();

  await db.update(leads).set(updates).where(eq(leads.id, Number(id)));

  const [updated] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, Number(id)))
    .limit(1);

  return NextResponse.json(updated);
}

// DELETE lead
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(leads).where(eq(leads.id, Number(id)));
  return NextResponse.json({ success: true });
}
