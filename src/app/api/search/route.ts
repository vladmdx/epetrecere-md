import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { publicCatalogData } from "@/lib/privacy/public-catalog";
import { searchAll } from "@/lib/search/meilisearch";
import { db } from "@/lib/db";
import { artists, venues } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // Rate limit: 30 searches per minute per IP
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`search:${ip}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ artists: [], venues: [] }, { status: 429 });
  }

  const query = req.nextUrl.searchParams.get("q");
  if (!query || query.length < 2) {
    return NextResponse.json({ artists: [], venues: [] });
  }

  const { userId } = await auth();
  const respond = (data: unknown) => NextResponse.json(publicCatalogData(data, Boolean(userId)), {headers:{"Cache-Control":"private, no-store"}});
  // Try Meilisearch first, fallback to DB search
  try {
    const results = await searchAll(query, 5);
    if (results.artists.length || results.venues.length) {
      // The index may lag deletions/moderation. The database is authoritative.
      const [activeArtists, activeVenues] = await Promise.all([
        results.artists.length ? db.select({id: artists.id}).from(artists).where(and(eq(artists.isActive, true), inArray(artists.id, results.artists.map(a => a.id)))) : [],
        results.venues.length ? db.select({id: venues.id}).from(venues).where(and(eq(venues.isActive, true), inArray(venues.id, results.venues.map(v => v.id)))) : [],
      ]);
      return respond({
        artists: results.artists.filter(a => activeArtists.some(x => x.id === a.id)),
        venues: results.venues.filter(v => activeVenues.some(x => x.id === v.id)),
      });
    }
  } catch {
    // Meilisearch not available, fall through to DB
  }

  // Fallback: simple DB search
  const searchPattern = `%${query}%`;

  const [artistResults, venueResults] = await Promise.all([
    db
      .select({
        id: artists.id,
        slug: artists.slug,
        name_ro: artists.nameRo,
        name_ru: artists.nameRu,
        location: artists.location,
        price_from: artists.priceFrom,
        rating_avg: artists.ratingAvg,
        type: sql<string>`'artist'`,
      })
      .from(artists)
      .where(
        sql`${artists.isActive} = true AND (${artists.nameRo} ILIKE ${searchPattern} OR ${artists.nameRu} ILIKE ${searchPattern} OR ${artists.nameEn} ILIKE ${searchPattern})`,
      )
      .limit(5),
    db
      .select({
        id: venues.id,
        slug: venues.slug,
        name_ro: venues.nameRo,
        name_ru: venues.nameRu,
        city: venues.city,
        price_per_person: venues.pricePerPerson,
        rating_avg: venues.ratingAvg,
        type: sql<string>`'venue'`,
      })
      .from(venues)
      .where(
        sql`${venues.isActive} = true AND (${venues.nameRo} ILIKE ${searchPattern} OR ${venues.nameRu} ILIKE ${searchPattern} OR ${venues.nameEn} ILIKE ${searchPattern})`,
      )
      .limit(5),
  ]);

  return respond({
    artists: artistResults,
    venues: venueResults,
  });
}
