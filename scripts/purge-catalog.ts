// Purge the artist catalog, keeping a hand-picked few. Venues are left alone
// unless explicitly opted in.
//
// Re-run from the project root:
//   npx tsx scripts/purge-catalog.ts                        # dry run (default)
//   CONFIRM=yes npx tsx scripts/purge-catalog.ts            # delete artists only
//   INCLUDE_VENUES=yes CONFIRM=yes npx tsx …                # also wipe venues
//
// Deletes every artist except KEEP_ARTIST_IDS. This is a hard delete: child
// rows (images, videos, packages, reviews, conversations, availability,
// credits, analytics…) disappear via ON DELETE CASCADE.
//
// Some FKs do NOT cascade and would abort the delete with a constraint
// violation, so we clear them first:
//   bookings.artist_id            — always (artists are going)
//   bookings.venue_id             ┐ only when INCLUDE_VENUES=yes
//   booking_requests.venue_id     ┘
// A booking without its vendor is meaningless, so those rows are deleted
// outright rather than orphaned.
//
// Everything runs inside ONE transaction: either the whole purge lands or
// nothing does.

// Load .env.local first (Next.js convention — that's where the local
// DATABASE_URL lives), then fall back to .env. Neither is committed.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

// The app's db uses the neon-http driver, which has no transaction support
// ("No transactions support in neon-http driver"). For a destructive multi-
// statement purge we want all-or-nothing, so this script opens its own
// WebSocket Pool connection via neon-serverless, which does support them.
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@/lib/db/schema";
import { artists, venues, bookings, bookingRequests } from "@/lib/db/schema";
import { notInArray, inArray, isNotNull, or, sql } from "drizzle-orm";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

/**
 * Artists to keep. Everything else goes.
 *   542 — Marcel Rosca                (the real registered account)
 *   489 — Moș Crăciun și Snegurocika  ┐
 *   492 — Ded Moroz                   │ generic, unnamed service listings
 *   418 — Teatrul de Foc              │ the catalog should keep a few of
 *   392 — Animatori                   ┘
 */
const KEEP_ARTIST_IDS = [542, 489, 492, 418, 392];

/** Bookings whose artist is being deleted (NULL artist rows are venue-only). */
const doomedArtistBooking = sql`${bookings.artistId} IS NOT NULL AND ${bookings.artistId} <> ALL(${sql.raw(
  `ARRAY[${KEEP_ARTIST_IDS.join(",")}]`,
)})`;

async function main() {
  const confirm = process.env.CONFIRM === "yes";
  // Venues are preserved by default — deleting them is a separate decision.
  const includeVenues = process.env.INCLUDE_VENUES === "yes";

  const keep = await db
    .select({ id: artists.id, name: artists.nameRo, slug: artists.slug })
    .from(artists)
    .where(inArray(artists.id, KEEP_ARTIST_IDS));

  const missing = KEEP_ARTIST_IDS.filter((id) => !keep.some((k) => k.id === id));
  if (missing.length > 0) {
    console.error(
      `✗ Keep-list artist id(s) not found: ${missing.join(", ")} — refusing to run.\n` +
        `  (Deleting with a wrong keep-list would wipe more than intended.)`,
    );
    await pool.end();
    process.exit(1);
  }

  const [{ count: artistTotal }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(artists);
  const [{ count: venueTotal }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(venues);
  const bookingFilter = includeVenues
    ? or(doomedArtistBooking, isNotNull(bookings.venueId))
    : doomedArtistBooking;
  const [{ count: bookingsHit }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(bookingFilter);
  const [{ count: reqHit }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookingRequests)
    .where(isNotNull(bookingRequests.venueId));

  console.log("\n=== Catalog purge ===");
  console.log("Keeping artists:");
  for (const k of keep) console.log(`   ${k.id} — ${k.name} (${k.slug})`);
  console.log(
    `Artists        : ${artistTotal} total → deleting ${artistTotal - keep.length}, keeping ${keep.length}`,
  );
  console.log(
    includeVenues
      ? `Venues         : ${venueTotal} total → deleting ${venueTotal}`
      : `Venues         : ${venueTotal} total → UNTOUCHED (set INCLUDE_VENUES=yes to delete)`,
  );
  console.log(`Bookings       : ${bookingsHit} row(s) reference a doomed vendor → deleted first`);
  console.log(
    includeVenues
      ? `BookingRequests: ${reqHit} venue row(s) → deleted first`
      : `BookingRequests: untouched (${reqHit} venue row(s) stay)`,
  );
  console.log("Everything else (images, reviews, conversations, …) cascades.\n");

  if (!confirm) {
    console.log(
      "Dry run only. Nothing was changed. To actually delete:\n" +
        "  CONFIRM=yes npx tsx scripts/purge-catalog.ts\n",
    );
    await pool.end();
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    // 1. Clear the non-cascading FKs first, or the deletes below abort.
    await tx.delete(bookings).where(bookingFilter);
    if (includeVenues) {
      await tx.delete(bookingRequests).where(isNotNull(bookingRequests.venueId));
    }

    // 2. The catalog itself; children cascade.
    await tx.delete(artists).where(notInArray(artists.id, KEEP_ARTIST_IDS));
    if (includeVenues) await tx.delete(venues);
  });

  const [{ count: artistsLeft }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(artists);
  const [{ count: venuesLeft }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(venues);

  console.log(
    `✓ Done. Artists left: ${artistsLeft} (expected ${KEEP_ARTIST_IDS.length}). ` +
      `Venues left: ${venuesLeft} (expected ${includeVenues ? 0 : venueTotal}).\n`,
  );
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("✗ Purge failed — transaction rolled back, nothing deleted.");
  console.error(err);
  try { await pool.end(); } catch { /* already closed */ }
  process.exit(1);
});
