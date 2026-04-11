import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { leadMatches, users, artists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// M3 — POST /api/lead-matches/[id]/status
// Lets an artist move an already-unlocked lead through the funnel
// (contacted → won / lost). Cannot go back to "matched".

const statusSchema = z.object({
  status: z.enum(["seen", "contacted", "won", "lost"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  const [match] = await db
    .select()
    .from(leadMatches)
    .where(eq(leadMatches.id, matchId))
    .limit(1);
  if (!match || match.artistId !== artist.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Contacted / won / lost require an unlocked lead
  if (
    (parsed.data.status === "contacted" ||
      parsed.data.status === "won" ||
      parsed.data.status === "lost") &&
    match.status === "matched"
  ) {
    return NextResponse.json(
      { error: "Lead must be unlocked before changing status" },
      { status: 400 },
    );
  }

  await db
    .update(leadMatches)
    .set({
      status: parsed.data.status,
      seenAt: match.seenAt ?? new Date(),
    })
    .where(eq(leadMatches.id, matchId));

  return NextResponse.json({ ok: true });
}
