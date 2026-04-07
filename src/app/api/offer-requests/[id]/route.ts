import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { offerRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// UPDATE offer request (admin mark as seen, add comment)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { adminSeen, adminComment, status } = body;

  const updates: Record<string, unknown> = {};
  if (adminSeen !== undefined) updates.adminSeen = adminSeen;
  if (adminComment !== undefined) updates.adminComment = adminComment;
  if (status) updates.status = status;

  await db.update(offerRequests).set(updates).where(eq(offerRequests.id, Number(id)));

  return NextResponse.json({ success: true });
}
