// Full calendar seed — every active artist gets slots on every day for
// the next 45 days across multiple price tiers. Designed so any date the
// user picks in the planner shows a realistic spread of options across
// every category.
//
// Idempotent: clears existing slots in the target window before inserting.
// Invoke with:  env $(grep -v '^#' .env.local | xargs) npx tsx scripts/seed-slots-full.ts

import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });

// Next 45 calendar days (inclusive of today + 45 future days).
function nextNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Price tiers so the budget filter is meaningful. Each artist gets a
// base tier via modulo of their id so it's deterministic and spread out.
const PRICE_TIERS = [100, 150, 200, 300, 450, 600, 850];

(async () => {
  const c = await pool.connect();
  const dates = nextNDays(45);
  console.log(
    `Target window: ${dates[0]} → ${dates[dates.length - 1]} (${dates.length} days)`,
  );

  const { rows: artists } = await c.query(
    `SELECT id, name_ro, price_from FROM artists
     WHERE is_active = true
     ORDER BY id`,
  );
  if (artists.length === 0) {
    console.error("No active artists.");
    process.exit(1);
  }
  console.log(`Active artists: ${artists.length}`);

  // Clear the window so re-runs don't double-insert. Scoped to slots with
  // `note LIKE '%seed%'` so we don't wipe real artist-entered slots.
  const del = await c.query(
    `DELETE FROM artist_availability_slots
     WHERE date = ANY($1::date[]) AND note LIKE '%seed%'`,
    [dates],
  );
  console.log(`Cleared ${del.rowCount} existing seeded slots.`);

  // Build the full values payload in one array so we can do a single
  // multi-row insert — much faster than 1 INSERT per slot.
  type Slot = {
    artistId: number;
    date: string;
    start: string;
    end: string;
    price: number;
    note: string;
  };
  const batch: Slot[] = [];

  for (const [idx, artist] of artists.entries()) {
    // Prefer the artist's own priceFrom if set, otherwise rotate through
    // the tier table so the marketplace has breadth.
    const base =
      typeof artist.price_from === "number" && artist.price_from > 0
        ? artist.price_from
        : PRICE_TIERS[idx % PRICE_TIERS.length];

    for (const date of dates) {
      const dayOfWeek = new Date(date + "T00:00:00").getDay(); // 0=Sun..6=Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
      const weekendBump = isWeekend ? Math.round(base * 0.3) : 0;

      // Two windows every day — afternoon + evening — weekends cost more.
      batch.push({
        artistId: artist.id,
        date,
        start: "14:00",
        end: "18:00",
        price: base + weekendBump,
        note: "Sesiune zi - seed",
      });
      batch.push({
        artistId: artist.id,
        date,
        start: "19:00",
        end: "23:00",
        price: base + weekendBump + 50,
        note: "Sesiune seară - seed",
      });
    }
  }

  // Postgres bulk insert in chunks — keeping under ~5k params per call
  // to stay well inside the 65k parameter ceiling.
  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    chunk.forEach((s, row) => {
      const o = row * 6;
      placeholders.push(
        `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`,
      );
      values.push(s.artistId, s.date, s.start, s.end, s.price, s.note);
    });
    await c.query(
      `INSERT INTO artist_availability_slots
         (artist_id, date, start_time, end_time, price, note)
       VALUES ${placeholders.join(", ")}`,
      values,
    );
    inserted += chunk.length;
    if (inserted % 2000 === 0) {
      console.log(`  …${inserted}/${batch.length} inserted`);
    }
  }

  console.log(
    `\n✓ Inserted ${inserted} slots for ${artists.length} artists × ${dates.length} days (2 slots/day).`,
  );

  c.release();
  await pool.end();
})();
