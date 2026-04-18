// Seeds artist_availability_slots across the top ~10 active artists for
// every Friday + Saturday next month. Gives us a realistic dataset so
// the planner's "Artiști disponibili pentru data ta" discovery + AI
// picker actually return real humans when testing.
//
// Safe to re-run: clears existing slots for the target window first.

import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });

// ─── Plan: every weekend day next calendar month ────────────────────
function nextMonthWeekendDates(): string[] {
  const now = new Date();
  // First day of next month.
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // Last day of next month.
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay(); // 0=Sun, 5=Fri, 6=Sat
    if (dow === 0 || dow === 5 || dow === 6) {
      out.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }
  }
  return out;
}

// Three price tiers so the budget filter is meaningful.
const PRICE_TIERS = [150, 250, 400];

(async () => {
  const c = await pool.connect();
  const dates = nextMonthWeekendDates();
  if (dates.length === 0) {
    console.error("No dates — shouldn't happen.");
    process.exit(1);
  }

  // Grab the 10 newest active artists so the test set is stable.
  const artists = await c.query(
    `SELECT id, name_ro FROM artists
     WHERE is_active = true
     ORDER BY created_at DESC
     LIMIT 10`,
  );
  if (artists.rows.length === 0) {
    console.error("No active artists — seed some first.");
    process.exit(1);
  }

  console.log(
    `Seeding ${dates.length} weekend dates × ${artists.rows.length} artists…`,
  );
  console.log(`Dates: ${dates[0]} → ${dates[dates.length - 1]}`);

  // Clear any prior test data on these dates so re-runs don't pile up.
  await c.query(
    `DELETE FROM artist_availability_slots
     WHERE artist_id = ANY($1::int[])
     AND date = ANY($2::date[])`,
    [artists.rows.map((a) => a.id), dates],
  );

  let total = 0;
  for (const [idx, artist] of artists.rows.entries()) {
    const tier = PRICE_TIERS[idx % PRICE_TIERS.length];
    for (const date of dates) {
      // Two windows per day — afternoon + evening — with different prices.
      await c.query(
        `INSERT INTO artist_availability_slots
           (artist_id, date, start_time, end_time, price, note)
         VALUES ($1, $2, '14:00', '18:00', $3, 'Zi - seed'),
                ($1, $2, '19:00', '23:00', $4, 'Seară - seed')`,
        [artist.id, date, tier, tier + 100],
      );
      total += 2;
    }
    console.log(
      `  · ${artist.name_ro} (#${artist.id}) — base ${tier}€ / ${tier + 100}€`,
    );
  }

  console.log(`\nInserted ${total} slots across ${dates.length} dates.`);

  c.release();
  await pool.end();
})();
