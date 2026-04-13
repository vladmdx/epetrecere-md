import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { artists, venues, leads, bookings } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

// Public endpoint — returns aggregate stats for the homepage counter section.
// Cached for 5 minutes via Next.js revalidation.
export const revalidate = 300;

export async function GET() {
  const [artistCount] = await db
    .select({ count: count() })
    .from(artists)
    .where(eq(artists.isActive, true));

  const [venueCount] = await db
    .select({ count: count() })
    .from(venues)
    .where(eq(venues.isActive, true));

  const [leadCount] = await db.select({ count: count() }).from(leads);

  const [bookingCount] = await db.select({ count: count() }).from(bookings);

  return NextResponse.json({
    artists: artistCount.count,
    venues: venueCount.count,
    events: leadCount.count + bookingCount.count,
    clients: leadCount.count,
  });
}
