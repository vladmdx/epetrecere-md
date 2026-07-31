// Inspect an artist + their availability so we can debug why they don't
// show up in date-scoped searches.
//
//   npx tsx scripts/inspect-artist.ts <name fragment>

import "dotenv/config";
import { db } from "@/lib/db";
import { artists, categories } from "@/lib/db/schema";
import {  ilike, sql } from "drizzle-orm";

async function main() {
  const fragment = process.argv[2];
  if (!fragment) {
    console.error("Usage: tsx scripts/inspect-artist.ts <name fragment>");
    process.exit(1);
  }

  const found = await db
    .select()
    .from(artists)
    .where(ilike(artists.nameRo, `%${fragment}%`))
    .limit(10);

  if (found.length === 0) {
    console.log(`No artists matching "${fragment}"`);
    process.exit(0);
  }

  for (const a of found) {
    console.log("\n[artist]", {
      id: a.id,
      slug: a.slug,
      nameRo: a.nameRo,
      userId: a.userId,
      isActive: a.isActive,
      isFeatured: a.isFeatured,
      categoryIds: a.categoryIds,
      location: a.location,
      baseCity: a.baseCity,
      travelDistanceKm: a.travelDistanceKm,
      priceFrom: a.priceFrom,
      priceHidden: a.priceHidden,
      calendarEnabled: a.calendarEnabled,
      createdAt: a.createdAt,
    });

    // Resolve category names for clarity
    if (a.categoryIds && a.categoryIds.length > 0) {
      const cats = await db
        .select({ id: categories.id, nameRo: categories.nameRo, type: categories.type })
        .from(categories)
        .where(sql`${categories.id} = ANY(${a.categoryIds})`);
      console.log("  categories:", cats);
    }

    // Show availability for June 2026 specifically (the user is testing
    // June 20). Look for both blocking entries and any working-hour
    // overrides on that date.
    const availabilityRows = await db.execute<{
      id: number;
      date: string;
      starttime: string | null;
      endtime: string | null;
      type: string;
    }>(sql`
      SELECT id, date::text as date, start_time as starttime, end_time as endtime, type
      FROM artist_availability
      WHERE artist_id = ${a.id}
        AND date >= '2026-06-01' AND date <= '2026-06-30'
      ORDER BY date
      LIMIT 50
    `);
    console.log("  June 2026 availability rows:", availabilityRows.rows ?? availabilityRows);

    // Bookings on June 20
    const bookings = await db.execute(sql`
      SELECT id, event_date::text as event_date, status, start_time, end_time
      FROM booking_requests
      WHERE artist_id = ${a.id}
        AND event_date::text = '2026-06-20'
    `);
    console.log("  June 20 bookings:", bookings.rows ?? bookings);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
