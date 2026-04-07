import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Approve / reject / delete review
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { action } = body; // "approve" | "reject"

  if (action === "approve") {
    await db.update(reviews).set({ isApproved: true }).where(eq(reviews.id, Number(id)));
  } else if (action === "reject") {
    await db.delete(reviews).where(eq(reviews.id, Number(id)));
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(reviews).where(eq(reviews.id, Number(id)));
  return NextResponse.json({ success: true });
}
