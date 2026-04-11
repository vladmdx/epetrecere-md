import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  leadMatches,
  users,
  artists,
  vendorCredits,
  creditTransactions,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// M3 — POST /api/lead-matches/[id]/unlock
//
// Spends 1 credit from the artist's wallet in exchange for unlocking the
// client's contact details on a matched lead. Idempotent: if the match is
// already unlocked, returns success without charging again.

const UNLOCK_COST = 1;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve artist
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

  // Load the match — must belong to this artist
  const [match] = await db
    .select()
    .from(leadMatches)
    .where(eq(leadMatches.id, matchId))
    .limit(1);
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.artistId !== artist.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotent: already unlocked
  if (
    match.status === "unlocked" ||
    match.status === "contacted" ||
    match.status === "won" ||
    match.status === "lost"
  ) {
    return NextResponse.json({ ok: true, alreadyUnlocked: true });
  }

  // Load or bootstrap the wallet
  let [wallet] = await db
    .select()
    .from(vendorCredits)
    .where(eq(vendorCredits.artistId, artist.id))
    .limit(1);

  if (!wallet) {
    // First-time wallet: seed with 3 free credits so vendors can try the
    // system without a top-up.
    const [created] = await db
      .insert(vendorCredits)
      .values({
        artistId: artist.id,
        balance: 3,
        totalPurchased: 3,
        totalSpent: 0,
      })
      .returning();
    wallet = created;
    await db.insert(creditTransactions).values({
      artistId: artist.id,
      delta: 3,
      kind: "bonus",
      note: "Credite de bun venit",
    });
  }

  if (wallet.balance < UNLOCK_COST) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: wallet.balance },
      { status: 402 },
    );
  }

  // Spend + unlock in a single transaction
  await db.transaction(async (tx) => {
    await tx
      .update(vendorCredits)
      .set({
        balance: sql`${vendorCredits.balance} - ${UNLOCK_COST}`,
        totalSpent: sql`${vendorCredits.totalSpent} + ${UNLOCK_COST}`,
        updatedAt: new Date(),
      })
      .where(eq(vendorCredits.artistId, artist.id));

    await tx
      .update(leadMatches)
      .set({
        status: "unlocked",
        unlockedAt: new Date(),
        seenAt: match.seenAt ?? new Date(),
      })
      .where(eq(leadMatches.id, matchId));

    await tx.insert(creditTransactions).values({
      artistId: artist.id,
      delta: -UNLOCK_COST,
      kind: "unlock",
      leadMatchId: matchId,
      note: `Unlock lead match #${matchId}`,
    });
  });

  return NextResponse.json({ ok: true });
}
