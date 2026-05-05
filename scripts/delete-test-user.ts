// Wipe a user + all data they own, on demand.
//
// Re-run from the project root:
//   npx tsx scripts/delete-test-user.ts <email>
//
// Two-phase: first prints what would be deleted, then performs the
// deletion. Used to reset a test account between QA passes.

import "dotenv/config";
import { db } from "@/lib/db";
import {
  users,
  venues,
  venueImages,
  venueMenuCategories,
  venueMenuPackages,
  notifications,
  bookingRequests,
  reviews,
  conversations,
  eventPlans,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx scripts/delete-test-user.ts <email>");
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id, clerkId: users.clerkId, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.log(`No user found with email ${email}`);
    process.exit(0);
  }

  console.log("[user]", user);

  const userVenues = await db
    .select({ id: venues.id, nameRo: venues.nameRo, slug: venues.slug })
    .from(venues)
    .where(eq(venues.userId, user.id));
  console.log("[venues]", userVenues);

  // Confirm before destructive ops — set CONFIRM=yes to actually delete.
  if (process.env.CONFIRM !== "yes") {
    console.log(
      "\nDry run only. Set CONFIRM=yes to actually delete:\n  CONFIRM=yes npx tsx scripts/delete-test-user.ts " +
        email,
    );
    process.exit(0);
  }

  // Wipe each venue and its dependents.
  for (const v of userVenues) {
    console.log(`\nDeleting venue ${v.id} (${v.nameRo})...`);
    // Menu items cascade off categories; categories + packages have a
    // direct FK to the venue.
    await db
      .delete(venueMenuCategories)
      .where(eq(venueMenuCategories.venueId, v.id));
    await db.delete(venueMenuPackages).where(eq(venueMenuPackages.venueId, v.id));
    await db.delete(venueImages).where(eq(venueImages.venueId, v.id));
    await db.delete(reviews).where(eq(reviews.venueId, v.id));
    await db.delete(bookingRequests).where(eq(bookingRequests.venueId, v.id));
    await db.delete(venues).where(eq(venues.id, v.id));
    console.log(`  → venue ${v.id} deleted`);
  }

  // User-owned rows that aren't venue-scoped.
  await db.delete(notifications).where(eq(notifications.userId, user.id));
  await db.delete(eventPlans).where(eq(eventPlans.userId, user.id));
  await db.delete(conversations).where(eq(conversations.clientUserId, user.id));

  // Bookings the user submitted as a CLIENT (different from the vendor side).
  await db
    .delete(bookingRequests)
    .where(eq(bookingRequests.clientUserId, user.id));

  await db.delete(users).where(eq(users.id, user.id));
  console.log(`\n[user] ${user.id} deleted`);

  // Clerk side — best-effort, fine to fail if already gone.
  if (user.clerkId && process.env.CLERK_SECRET_KEY) {
    try {
      const r = await fetch(
        `https://api.clerk.com/v1/users/${user.clerkId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
          },
        },
      );
      if (r.ok) {
        console.log(`[clerk] user ${user.clerkId} deleted`);
      } else {
        console.log(
          `[clerk] delete returned ${r.status} — ${await r.text()}`,
        );
      }
    } catch (err) {
      console.log("[clerk] delete threw:", err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
