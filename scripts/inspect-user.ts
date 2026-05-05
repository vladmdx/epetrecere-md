// Quick read-only inspection of a user's onboarding state, used to diagnose
// why /auth-redirect routes someone past the role picker.
//
//   npx tsx scripts/inspect-user.ts <email>

import "dotenv/config";
import { db } from "@/lib/db";
import { users, venues, artists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx scripts/inspect-user.ts <email>");
    process.exit(1);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.log(`No user with email ${email}`);
    process.exit(0);
  }

  console.log("[user]", {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    role: user.role,
    onboardingComplete: user.onboardingComplete,
    phone: user.phone,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });

  const userVenues = await db
    .select({ id: venues.id, nameRo: venues.nameRo, slug: venues.slug, isActive: venues.isActive })
    .from(venues)
    .where(eq(venues.userId, user.id));
  console.log("[venues]", userVenues);

  const userArtists = await db
    .select({ id: artists.id, nameRo: artists.nameRo, slug: artists.slug, isActive: artists.isActive })
    .from(artists)
    .where(eq(artists.userId, user.id));
  console.log("[artists]", userArtists);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
