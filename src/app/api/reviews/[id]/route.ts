import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { reviews, artists, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

// Approve / reject review — admin only; Reply — admin OR artist owner
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { action, reply } = body;

  // If action is "approve" or "reject", require admin
  if (action === "approve" || action === "reject") {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

    if (action === "approve") {
      await db.update(reviews).set({ isApproved: true }).where(eq(reviews.id, Number(id)));
    } else {
      await db.delete(reviews).where(eq(reviews.id, Number(id)));
    }
    return NextResponse.json({ success: true });
  }

  // If reply is provided, allow both admin AND the artist owner
  if (reply !== undefined) {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check if admin
    const adminCheck = await requireAdmin();
    if (adminCheck.ok) {
      await db.update(reviews).set({ reply }).where(eq(reviews.id, Number(id)));
      return NextResponse.json({ success: true });
    }

    // Check if artist owner of this review
    const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId)).limit(1);
    if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [review] = await db.select({ artistId: reviews.artistId }).from(reviews).where(eq(reviews.id, Number(id))).limit(1);
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    const [artist] = await db.select({ id: artists.id }).from(artists)
      .where(and(eq(artists.id, review.artistId!), eq(artists.userId, appUser.id))).limit(1);
    if (!artist) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db.update(reviews).set({ reply }).where(eq(reviews.id, Number(id)));
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { id } = await params;
  await db.delete(reviews).where(eq(reviews.id, Number(id)));
  return NextResponse.json({ success: true });
}
