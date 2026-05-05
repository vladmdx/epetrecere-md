// How many existing client accounts would the broadened isNewUser check
// re-prompt? Read-only diagnostic — counts users who picked "client"
// (onboardingComplete=true, role="user", no venue, no artist).

import "dotenv/config";
import { db } from "@/lib/db";
import { users, venues, artists } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

async function main() {
  const clientUsers = await db
    .select({
      id: users.id,
      email: users.email,
      onboardingComplete: users.onboardingComplete,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      and(
        eq(users.role, "user"),
        eq(users.onboardingComplete, true),
      ),
    );

  let withoutVenueOrArtist = 0;
  for (const u of clientUsers) {
    const [v] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.userId, u.id))
      .limit(1);
    if (v) continue;
    const [a] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.userId, u.id))
      .limit(1);
    if (a) continue;
    withoutVenueOrArtist++;
  }

  const [totalRow] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
  console.log("Total users:", totalRow.c);
  console.log("Existing clients (role=user, onboardingComplete=true):", clientUsers.length);
  console.log("...without venue or artist (would re-prompt):", withoutVenueOrArtist);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
