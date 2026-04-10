import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leadActivities } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET activities for a lead
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const activities = await db
    .select()
    .from(leadActivities)
    .where(eq(leadActivities.leadId, Number(id)))
    .orderBy(desc(leadActivities.createdAt));

  return NextResponse.json(activities);
}

// POST — add activity (note, call, email, sms)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const { type, content } = body;

  if (!type || !content) {
    return NextResponse.json({ error: "type and content required" }, { status: 400 });
  }

  const [activity] = await db
    .insert(leadActivities)
    .values({
      leadId: Number(id),
      type,
      content,
    })
    .returning();

  return NextResponse.json(activity, { status: 201 });
}
