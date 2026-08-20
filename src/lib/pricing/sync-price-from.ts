/**
 * Keep `artists.price_from` in step with the artist's tiers.
 *
 * price_from is a denormalized cache: the catalogue's "de la X €", the
 * price_min/price_max filters and the price sort all read it. It was written
 * once at onboarding and never again, so an artist who changed their tariffs
 * afterwards kept being listed — and filtered — at their original price.
 * Adding per-event pricing would have made that drift worse, so every
 * mutation of a tier now recomputes it.
 *
 * The floor is the cheapest visible priced tier of either kind: an hourly
 * tier and a fixed per-event price are both things a client can actually pay.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { artistPackages, artists } from "@/lib/db/schema";

export async function syncArtistPriceFrom(artistId: number): Promise<void> {
  const [row] = await db
    .select({ min: sql<number | null>`min(${artistPackages.price})` })
    .from(artistPackages)
    .where(
      and(
        eq(artistPackages.artistId, artistId),
        eq(artistPackages.isVisible, true),
        sql`${artistPackages.price} is not null and ${artistPackages.price} > 0`,
      ),
    );

  // No priced tier left → clear the cache rather than leave a stale figure
  // the artist can no longer honour.
  await db
    .update(artists)
    .set({ priceFrom: row?.min ?? null })
    .where(eq(artists.id, artistId));
}
