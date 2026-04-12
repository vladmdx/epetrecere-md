import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

// Admin-only: returns ALL reviews including unapproved
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const allReviews = await db
    .select()
    .from(reviews)
    .orderBy(desc(reviews.createdAt))
    .limit(100);

  return NextResponse.json(allReviews);
}
