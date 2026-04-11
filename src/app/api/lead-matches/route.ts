import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  leadMatches,
  leads,
  users,
  artists,
  vendorCredits,
} from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

// M3 — GET /api/lead-matches
//
// Returns the signed-in artist's lead feed. Client contact details (phone,
// email, full name) are REDACTED unless the match has been unlocked by
// spending a credit. Score, reasons, event date/location, budget, guest
// count and category hints are always visible so the vendor can decide.

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve app user → artist
  const [appUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);
  if (!artist) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  // Load matches + underlying lead in one join
  const rows = await db
    .select({
      match: leadMatches,
      lead: leads,
    })
    .from(leadMatches)
    .innerJoin(leads, eq(leads.id, leadMatches.leadId))
    .where(eq(leadMatches.artistId, artist.id))
    .orderBy(desc(leadMatches.createdAt))
    .limit(100);

  // Load credit balance for UI
  const [credits] = await db
    .select()
    .from(vendorCredits)
    .where(eq(vendorCredits.artistId, artist.id))
    .limit(1);

  const payload = rows.map(({ match, lead }) => {
    const unlocked = match.status === "unlocked" ||
      match.status === "contacted" ||
      match.status === "won" ||
      match.status === "lost";
    return {
      id: match.id,
      score: match.score,
      reasons: match.reasons ?? [],
      status: match.status,
      seenAt: match.seenAt,
      unlockedAt: match.unlockedAt,
      createdAt: match.createdAt,
      lead: {
        id: lead.id,
        // Public fields
        eventType: lead.eventType,
        eventDate: lead.eventDate,
        location: lead.location,
        guestCount: lead.guestCount,
        budget: lead.budget,
        source: lead.source,
        message: lead.message,
        // Gated fields
        name: unlocked ? lead.name : maskName(lead.name),
        phone: unlocked ? `${lead.phonePrefix ?? "+373"} ${lead.phone}` : null,
        email: unlocked ? lead.email : null,
      },
    };
  });

  return NextResponse.json({
    matches: payload,
    credits: {
      balance: credits?.balance ?? 0,
      totalPurchased: credits?.totalPurchased ?? 0,
      totalSpent: credits?.totalSpent ?? 0,
    },
  });
}

function maskName(name: string): string {
  // "Ion Popescu" → "I. P***"
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p, i) => (i === 0 ? `${p[0]}.` : `${p[0]}***`))
    .join(" ");
}
