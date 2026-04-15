import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, artists, venues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // Rate limit to prevent abuse
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`check-role:${ip}`, 15, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Prefer Clerk session auth over email param to avoid enumeration
  const { userId: clerkId } = await auth();

  const email = req.nextUrl.searchParams.get("email");
  if (!clerkId && !email) {
    return NextResponse.json({ role: "user", isNewUser: true });
  }

  // Try to find the user by clerkId first, then by email
  let dbUser: typeof users.$inferSelect | null = null;

  if (clerkId) {
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    dbUser = found ?? null;
  }

  if (!dbUser && email) {
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    dbUser = found ?? null;
  }

  // User not in DB yet (webhook hasn't fired or CLERK_WEBHOOK_SECRET missing).
  // Create the user record as a fallback so the flow isn't broken.
  if (!dbUser && clerkId) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(clerkId);
      const fallbackEmail =
        clerkUser.emailAddresses[0]?.emailAddress || email || "";
      const fallbackName = [clerkUser.firstName, clerkUser.lastName]
        .filter(Boolean)
        .join(" ") || null;

      if (fallbackEmail) {
        const [created] = await db
          .insert(users)
          .values({
            clerkId,
            email: fallbackEmail,
            name: fallbackName,
            avatarUrl: clerkUser.imageUrl || null,
            role: "user",
          })
          .onConflictDoNothing()
          .returning();
        dbUser = created ?? null;

        // If insert was a no-op (conflict), try fetching again
        if (!dbUser) {
          const [found] = await db
            .select()
            .from(users)
            .where(eq(users.clerkId, clerkId))
            .limit(1);
          dbUser = found ?? null;
        }
      }
    } catch (err) {
      console.error("[check-role] Fallback user creation failed:", err);
    }
  }

  if (!dbUser) {
    return NextResponse.json({
      role: "user",
      isNewUser: true,
      hasVenue: false,
      onboardingComplete: false,
    });
  }

  // Check venue ownership (separate from role)
  const [venue] = await db
    .select({ id: venues.id, slug: venues.slug, isActive: venues.isActive })
    .from(venues)
    .where(eq(venues.userId, dbUser.id))
    .limit(1);

  // If user is an artist, check onboarding status
  if (dbUser.role === "artist") {
    const [artist] = await db
      .select({
        id: artists.id,
        slug: artists.slug,
        isActive: artists.isActive,
      })
      .from(artists)
      .where(eq(artists.userId, dbUser.id))
      .limit(1);

    return NextResponse.json({
      role: "artist",
      onboardingComplete: !!artist,
      artistApproved: artist?.isActive ?? false,
      artistId: artist?.id ?? null,
      artistSlug: artist?.slug ?? null,
      venueId: venue?.id ?? null,
      venueSlug: venue?.slug ?? null,
      venueApproved: venue?.isActive ?? false,
    });
  }

  // For regular users: determine if they need to see the role picker.
  // A user is "new" (needs role picker) if:
  //   - role is the default "user"
  //   - they don't own a venue
  //   - they don't have an artist record
  // This is more reliable than a 2-minute time window.
  const hasVenue = !!venue;
  let isNewUser = false;

  if (dbUser.role === "user" && !hasVenue) {
    // Check if they have an artist record (shouldn't happen if role != "artist", but be safe)
    const [artistRecord] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, dbUser.id))
      .limit(1);

    if (!artistRecord) {
      // User has no role assignment at all — show role picker
      isNewUser = true;
    }
  }

  return NextResponse.json({
    role: hasVenue ? "venue" : dbUser.role,
    onboardingComplete: true,
    hasVenue,
    isNewUser,
    venueId: venue?.id ?? null,
    venueSlug: venue?.slug ?? null,
    venueApproved: venue?.isActive ?? false,
  });
}
