import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  users,
  artists,
  venues,
  eventPlans,
  bookingRequests,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

// This endpoint drives the post-signup role picker. The response MUST
// reflect the latest DB state — a stale cached "you're already onboarded"
// answer would silently bypass the picker for a freshly re-signed-up user.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // Rate limit to prevent abuse
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`check-role:${ip}`, 15, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // PII/role data is only ever returned for the authenticated caller. The
  // `email` query param is intentionally NOT used to identify a user —
  // that previously let an unauthenticated caller enumerate role + phone
  // for any known email (`?email=victim@…`). Every legitimate caller (the
  // post-signup redirect, dashboard pages) is signed in, so requiring a
  // Clerk session here breaks no flow. The param is left ignored so
  // existing callers that still append it keep working.
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ role: "user", isNewUser: true });
  }

  // Find the user by their Clerk id.
  let dbUser: typeof users.$inferSelect | null = null;
  {
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    dbUser = found ?? null;
  }

  // Not linked yet (webhook hasn't fired, CLERK_WEBHOOK_SECRET missing, or
  // the row predates the Clerk account — e.g. an admin-imported vendor).
  // Resolve the caller's OWN verified email from Clerk (never a client
  // param) to link a pre-existing row or create a new one.
  if (!dbUser) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(clerkId);
      const ownEmail = clerkUser.emailAddresses[0]?.emailAddress || "";

      if (ownEmail) {
        const [existing] = await db
          .select()
          .from(users)
          .where(eq(users.email, ownEmail))
          .limit(1);

        if (existing) {
          // Link the caller's Clerk id onto their own pre-existing row.
          if (!existing.clerkId) {
            await db
              .update(users)
              .set({ clerkId, updatedAt: new Date() })
              .where(eq(users.id, existing.id));
          }
          dbUser = existing;
        } else {
          const fallbackName = [clerkUser.firstName, clerkUser.lastName]
            .filter(Boolean)
            .join(" ") || null;

          const [created] = await db
            .insert(users)
            .values({
              clerkId,
              email: ownEmail,
              name: fallbackName,
              avatarUrl: clerkUser.imageUrl || null,
              role: "user",
            })
            .onConflictDoNothing()
            .returning();
          dbUser = created ?? null;

          // If insert was a no-op (race/conflict), fetch again by clerkId.
          if (!dbUser) {
            const [found] = await db
              .select()
              .from(users)
              .where(eq(users.clerkId, clerkId))
              .limit(1);
            dbUser = found ?? null;
          }
        }
      }
    } catch (err) {
      console.error("[check-role] Fallback user resolution failed:", err);
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
  //
  // Two layers of detection so we never silently dump a fresh signup on
  // /cabinet as "client":
  //
  //   1. Default-state check — onboardingComplete still false AND no
  //      venue/artist row → never picked a role yet.
  //   2. Activity check — even if onboardingComplete somehow flipped to
  //      true (webhook race, manual flag flip, leftover state from a
  //      deleted-then-re-signed-up account), require *evidence* of
  //      genuine client use (event plan or submitted booking) before
  //      treating them as an existing client. No evidence → re-show
  //      the picker. The picker is idempotent; one extra click is a
  //      negligible UX cost vs. silently locking a partner/venue
  //      candidate into a client experience.
  const hasVenue = !!venue;
  let isNewUser = false;

  if (dbUser.role === "user" && !hasVenue) {
    const [artistRecord] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, dbUser.id))
      .limit(1);

    if (!artistRecord) {
      if (!dbUser.onboardingComplete) {
        isNewUser = true;
      } else {
        // onboardingComplete=true but no role-bearing entity → check for
        // real client activity. If none, the picker re-confirms intent.
        const [plan] = await db
          .select({ id: eventPlans.id })
          .from(eventPlans)
          .where(eq(eventPlans.userId, dbUser.id))
          .limit(1);
        const [booking] = plan
          ? [null]
          : await db
              .select({ id: bookingRequests.id })
              .from(bookingRequests)
              .where(eq(bookingRequests.clientUserId, dbUser.id))
              .limit(1);
        if (!plan && !booking) {
          isNewUser = true;
        }
      }
    }
  }

  return NextResponse.json({
    role: hasVenue ? "venue" : dbUser.role,
    onboardingComplete: true,
    hasVenue,
    isNewUser,
    phone: dbUser.phone ?? null,
    venueId: venue?.id ?? null,
    venueSlug: venue?.slug ?? null,
    venueApproved: venue?.isActive ?? false,
  });
}
