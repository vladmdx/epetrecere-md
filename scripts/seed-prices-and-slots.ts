// Seed script — populates random prices on ~half of the active artists and
// adds category-appropriate availability slots for the next 120 days. Run:
//
//   DATABASE_URL=... npx tsx scripts/seed-prices-and-slots.ts
//
// Idempotent per-date: we skip dates where the artist already has slots
// so re-running only fills gaps. Existing slots are left untouched.

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

type SlotWindow = { startTime: string; endTime: string };

/**
 * Category-id → slot windows. Each window models a realistic booking shape
 * for that profession:
 *   - Cântăreți: multiple 1–2h performance slots (e.g. 20:00–22:00)
 *   - Moderatori: one long "full event" window (e.g. 17:00–00:00)
 *   - Fotografi: one 5–6h window anchored around the ceremony
 *   - DJ: one long 5–7h evening window
 *   - Animatori: 2–3h afternoon window
 *   - Formații: one 2–3h late-evening window
 *   - Show/Dansatori: short 30m–1h slots
 *   - Decor: full day
 *   - Default: two evening windows (14–18, 19–23)
 */
function slotsForCategory(categoryId: number): SlotWindow[] {
  // Singers (id 3, 11, 12, 13, 14, 15) — 1–2h slots, often multiple per day
  if ([3, 11, 12, 13, 14, 15].includes(categoryId)) {
    return [
      { startTime: "17:00", endTime: "19:00" },
      { startTime: "20:00", endTime: "22:00" },
    ];
  }
  // Moderatori / MC (id 1) — full event
  if (categoryId === 1) {
    return [{ startTime: "17:00", endTime: "23:00" }];
  }
  // DJ (id 2) — long evening
  if (categoryId === 2) {
    return [{ startTime: "18:00", endTime: "23:00" }];
  }
  // Formații (id 4) — 2–3h late evening
  if (categoryId === 4) {
    return [{ startTime: "20:00", endTime: "23:00" }];
  }
  // Fotografi / Videografi / Foto-Video (id 5, 6, 28, 29) — 5–6h window
  if ([5, 6, 28, 29].includes(categoryId)) {
    return [{ startTime: "15:00", endTime: "21:00" }];
  }
  // Animatori (id 8)
  if (categoryId === 8) {
    return [{ startTime: "14:00", endTime: "17:00" }];
  }
  // Show program / Dansatori / Dansuri populare (id 10, 16, 17, 18, 19)
  if ([10, 16, 17, 18, 19].includes(categoryId)) {
    return [
      { startTime: "19:00", endTime: "20:00" },
      { startTime: "21:00", endTime: "22:00" },
    ];
  }
  // Default (décor / equipment / everything else)
  return [
    { startTime: "14:00", endTime: "18:00" },
    { startTime: "19:00", endTime: "23:00" },
  ];
}

/** Price range per category — we roll one number per artist, same range. */
function priceRangeForCategory(categoryId: number): [number, number] {
  // Moderatori, DJ, Fotografi, Videografi — higher-end (150–400)
  if ([1, 2, 5, 6, 28].includes(categoryId)) return [150, 400];
  // Cântăreți / Formații — (200–400)
  if ([3, 4, 11, 12, 13].includes(categoryId)) return [200, 400];
  // Animatori / Show — (100–250)
  if ([8, 10, 16, 17, 18, 19].includes(categoryId)) return [100, 250];
  // Default
  return [100, 300];
}

function randInt(lo: number, hi: number) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function main() {
  console.log("→ Loading active artists…");
  const artists = (await sql`
    SELECT id, name_ro, category_ids, price_from
    FROM artists
    WHERE is_active = true
    ORDER BY id
  `) as Array<{
    id: number;
    name_ro: string;
    category_ids: number[] | null;
    price_from: number | null;
  }>;
  console.log(`  Found ${artists.length} active artists`);

  // 1) Price seeding — set price_from on ~65% of artists that don't have one
  let priced = 0;
  for (const a of artists) {
    if (a.price_from != null && a.price_from > 0) continue;
    if (Math.random() > 0.65) continue; // 35% intentionally left unpriced
    const firstCategory = a.category_ids?.[0] ?? 0;
    const [lo, hi] = priceRangeForCategory(firstCategory);
    // Round to nearest 50 so prices look intentional rather than random
    const raw = randInt(lo, hi);
    const rounded = Math.round(raw / 50) * 50;
    await sql`UPDATE artists SET price_from = ${rounded} WHERE id = ${a.id}`;
    priced++;
  }
  console.log(`  ✓ Priced ${priced} artists`);

  // 2) Slot seeding — for each artist, generate category-appropriate slots
  //    on 3–6 random future dates within the next 120 days. Skip dates that
  //    already have slots so the script is idempotent.
  console.log("→ Generating availability slots…");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizonDays = 120;

  let slotsInserted = 0;
  let artistsTouched = 0;

  for (const a of artists) {
    const firstCategory = a.category_ids?.[0] ?? 0;
    const windows = slotsForCategory(firstCategory);
    const [lo, hi] = priceRangeForCategory(firstCategory);

    // Pick 6–12 random future dates for this artist
    const pickCount = randInt(6, 12);
    const pickedDates = new Set<string>();
    let tries = 0;
    while (pickedDates.size < pickCount && tries < pickCount * 3) {
      tries++;
      const offset = randInt(1, horizonDays);
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      pickedDates.add(isoDate(d));
    }

    // Skip dates that already have slots for this artist
    const datesArr = [...pickedDates];
    const existing = (await sql`
      SELECT date::text AS date FROM artist_availability_slots
      WHERE artist_id = ${a.id}
        AND date = ANY(${datesArr}::date[])
    `) as Array<{ date: string }>;
    const skipDates = new Set(existing.map((r) => r.date));
    const freshDates = datesArr.filter((d) => !skipDates.has(d));

    if (freshDates.length === 0) continue;
    artistsTouched++;

    for (const date of freshDates) {
      for (const w of windows) {
        const slotPrice = Math.round(randInt(lo, hi) / 50) * 50;
        await sql`
          INSERT INTO artist_availability_slots
            (artist_id, date, start_time, end_time, price, is_booked)
          VALUES (${a.id}, ${date}, ${w.startTime}, ${w.endTime}, ${slotPrice}, false)
        `;
        slotsInserted++;
      }
    }
  }

  console.log(`  ✓ Inserted ${slotsInserted} slots across ${artistsTouched} artists`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
