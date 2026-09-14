import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { listAccessibleVenueIds } from "@/lib/venue-access";
import {
  users,
  artists,
  venues,
  eventPlans,
  bookingRequests,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { bootstrapAccountUserUnlessErased } from "@/lib/privacy/account-erasure-identity";

// This endpoint drives the post-signup role picker. The response MUST
// reflect the latest DB state — a stale cached "you're already onboarded"
// answer would silently bypass the picker for a freshly re-signed-up user.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // This response contains role, onboarding and profile identifiers. It is
  // strictly self-scoped; an e-mail query parameter is never authorization.
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit to prevent abuse.
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`check-role:${clerkId}:${ip}`, 15, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Resolve exclusively from the authenticated Clerk subject. Looking up an
  // arbitrary `?email=` previously allowed account enumeration and PII leaks.
  let dbUser: typeof users.$inferSelect | null = null;
  const [found] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  dbUser = found ?? null;

  // User not in DB yet (webhook hasn't fired or CLERK_WEBHOOK_SECRET missing).
  // Create the user record as a fallback so the flow isn't broken.
  if (!dbUser) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(clerkId);
      const fallbackEmail =
        clerkUser.emailAddresses[0]?.emailAddress || "";
      const fallbackName = [clerkUser.firstName, clerkUser.lastName]
        .filter(Boolean)
        .join(" ") || null;

      if (fallbackEmail) {
        const bootstrapped = await bootstrapAccountUserUnlessErased({
          clerkId,
          email: fallbackEmail,
          name: fallbackName,
          avatarUrl: clerkUser.imageUrl || null,
        });
        if (!bootstrapped) {
          return NextResponse.json(
            { error: "Account erased", code: "ACCOUNT_ERASED" },
            { status: 410 },
          );
        }
        dbUser = bootstrapped;
      }
    } catch (err) {
      console.error("[check-role] Fallback user creation failed:", err);
      return NextResponse.json(
        { error: "Account sync unavailable", code: "ACCOUNT_SYNC_RETRY" },
        { status: 503 },
      );
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

  // Check venue ownership (separate from role). ADR 0028 — membership chain.
  const venueRows = await db
    .select({
      id: venues.id,
      slug: venues.slug,
      isActive: venues.isActive,
      organizationId: venues.organizationId,
    })
    .from(venues)
    .where(inArray(venues.id, await listAccessibleVenueIds(dbUser.id)));
  // During an OFF→ON rollout, prioritize the organization-null venue which
  // must be recovered in onboarding. Picking an arbitrary attached venue can
  // otherwise hide the incomplete legacy row forever.
  const venue = isMultiHallEnabled()
    ? venueRows.find((row) => row.organizationId == null) ?? venueRows[0]
    : venueRows[0];

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
  const venueNeedsOrganization = Boolean(
    venue && isMultiHallEnabled() && venue.organizationId == null,
  );
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
    onboardingComplete: dbUser.onboardingComplete && !venueNeedsOrganization,
    hasVenue,
    venueNeedsOrganization,
    isNewUser,
    phone: dbUser.phone ?? null,
    venueId: venue?.id ?? null,
    venueSlug: venue?.slug ?? null,
    venueApproved: venue?.isActive ?? false,
  });
}
