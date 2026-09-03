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
import { desc, eq } from "drizzle-orm";
import { privateLeadSummary } from "@/lib/privacy/lead-summary";
import { redactContact } from "@/lib/privacy/contact-redaction";
import { plainText } from "@/lib/content/plain-text";

// Contacts are only shared in a confirmed booking, never through lead status or credits.

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
    return {
      id: match.id,
      score: match.score,
      reasons: (match.reasons ?? []).map(reason => redactContact(plainText(reason))),
      status: match.status,
      seenAt: match.seenAt,
      unlockedAt: match.unlockedAt,
      createdAt: match.createdAt,
      lead: privateLeadSummary(lead),
    };
  });

  return NextResponse.json({
    matches: payload,
    credits: {
      balance: credits?.balance ?? 0,
      totalPurchased: credits?.totalPurchased ?? 0,
      totalSpent: credits?.totalSpent ?? 0,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
