import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, venues } from "@/lib/db/schema";

/**
 * The handful of fields an artist or venue profile shows only to signed-in
 * visitors: the starting price and the owner's own web presence.
 *
 * These used to be stripped server-side inside the page, which meant the page
 * had to read the session — and a route that reads the session cannot be
 * prerendered, so the two highest-traffic SEO surfaces on the site were
 * rendered from scratch on every request. The pages now render the anonymous
 * shape statically and ask here for the rest once, in the browser, after
 * Clerk says the visitor is signed in.
 *
 * The anonymous HTML therefore never contains a price. That is the whole
 * point: the client-side `isSignedIn` check in the profile component only
 * decides what to DRAW, so on its own it would have shipped the price to
 * everyone and merely hidden it.
 *
 * Phone and e-mail are deliberately NOT here. They are admin-only, and
 * clients are meant to reach a partner through the platform's own booking
 * and chat, not around it.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type");
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug || (type !== "artist" && type !== "venue")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (type === "artist") {
    const [row] = await db
      .select({
        priceFrom: artists.priceFrom,
        priceCurrency: artists.priceCurrency,
        instagram: artists.instagram,
        facebook: artists.facebook,
        tiktok: artists.tiktok,
        youtube: artists.youtube,
        website: artists.website,
      })
      .from(artists)
      .where(eq(artists.slug, slug))
      .limit(1);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(row, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const [row] = await db
    .select({
      pricePerPerson: venues.pricePerPerson,
      website: venues.website,
    })
    .from(venues)
    .where(eq(venues.slug, slug))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(row, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
