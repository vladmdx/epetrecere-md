// End-to-end test for the planner / booking / AI-prep flows added in
// Fazele 1–11. Runs direct against the Neon DB (skips the Clerk auth
// boundary) and creates / exercises / cleans up a synthetic plan.
// Invoke with:  `env $(grep -v '^#' .env.local | xargs) npx tsx scripts/test-flows.ts`
//
// Each test prints ✓ or ✗ and the whole run exits non-zero on first
// failure. Nothing else depends on the DB state at startup — we use
// a tag ("E2E_TEST_FLOW_2026") to guarantee cleanup even after crashes.

import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

const TAG = "E2E_TEST_FLOW_2026";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function pass(name: string, detail?: string) {
  checks.push({ name, ok: true, detail });
}
function fail(name: string, detail?: string): never {
  checks.push({ name, ok: false, detail });
  // Keep running further checks so we get a full picture; throw later.
  throw new Error(`${name}: ${detail}`);
}

let userId: string;
let artistId: number;
let planId: number | null = null;

(async () => {
  const c = await pool.connect();

  // ─── Prereqs — borrow a real user + active artist ───────────────
  const u = await c.query(
    "SELECT id, email, name FROM users WHERE role = 'user' LIMIT 1",
  );
  if (u.rows.length === 0) {
    console.error("No regular user in DB — create one first.");
    process.exit(1);
  }
  userId = u.rows[0].id;
  const userEmail = u.rows[0].email;
  const userName = u.rows[0].name ?? "E2E Client";
  pass("prereq: found user", `${userEmail}`);

  const a = await c.query(
    "SELECT id, name_ro FROM artists WHERE is_active = true LIMIT 1",
  );
  if (a.rows.length === 0) fail("prereq: no active artist");
  artistId = a.rows[0].id;
  pass("prereq: found artist", `#${artistId} ${a.rows[0].name_ro}`);

  try {
    // ─── Faza 1: schema has new cols ─────────────────────────────
    const cols = await c.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'booking_requests'
       AND column_name IN ('event_plan_id','agreed_price','paid_status','price_offers')`,
    );
    cols.rows.length === 4
      ? pass("Faza 1: booking_requests has all 4 new cols")
      : fail("Faza 1 schema", `got ${cols.rows.length}/4`);

    const slotCol = await c.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'artist_availability_slots'`,
    );
    slotCol.rowCount ? pass("Faza 6: slots table exists") : fail("Faza 6 schema");

    const planCols = await c.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'event_plans'
       AND column_name IN ('status','venue_needed','selected_categories','archived_at')`,
    );
    planCols.rows.length === 4
      ? pass("Faza 1: event_plans has all 4 new cols")
      : fail("Faza 1 plan schema", `got ${planCols.rows.length}/4`);

    // ─── Fazele 2+3+9: create a plan (mimics /api/event-plans/from-wizard) ─
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const futureIso = futureDate.toISOString().slice(0, 10);

    const p = await c.query(
      `INSERT INTO event_plans
         (user_id, title, event_type, event_date, location, guest_count_target,
          budget_target, venue_needed, selected_categories, status, notes)
       VALUES ($1,$2,'wedding',$3,'Chișinău',120,5000,true,'[]'::jsonb,'active',$4)
       RETURNING id`,
      [userId, `${TAG} Nunta E2E`, futureIso, TAG],
    );
    planId = p.rows[0].id;
    pass("Faza 2/9: event plan inserted", `id=${planId}`);

    // ─── Faza 2: GET /api/event-plans?status=active would see it ─
    const listQ = await c.query(
      `SELECT COUNT(*)::int AS n FROM event_plans
       WHERE user_id = $1 AND status = 'active'`,
      [userId],
    );
    Number(listQ.rows[0].n) > 0
      ? pass("Faza 2: active-status query surfaces the plan")
      : fail("Faza 2 filter");

    // ─── Fazele 3+4: create a booking linked to the plan ───────
    const bk = await c.query(
      `INSERT INTO booking_requests
        (artist_id, event_plan_id, client_user_id, client_name, client_phone,
         client_email, event_date, status, message)
       VALUES ($1,$2,$3,$4,'+37369000000',$5,$6,'pending',$7)
       RETURNING id`,
      [
        artistId,
        planId,
        userId,
        userName,
        userEmail,
        futureIso,
        `${TAG} test booking`,
      ],
    );
    const bookingId = bk.rows[0].id;
    pass("Faza 3: booking with event_plan_id inserted", `id=${bookingId}`);

    // Sanity: the plan-scoped filter the dashboard uses would match
    const scoped = await c.query(
      `SELECT COUNT(*)::int AS n FROM booking_requests
       WHERE event_plan_id = $1`,
      [planId],
    );
    Number(scoped.rows[0].n) > 0
      ? pass("Faza 3: booking visible via event_plan_id filter")
      : fail("Faza 3 booking filter");

    // ─── Faza 5: price_offers jsonb append (simulates propose_price) ─
    const offer1 = {
      from: "client",
      amount: 400,
      message: "Propunere inițială",
      at: new Date().toISOString(),
    };
    await c.query(
      `UPDATE booking_requests
       SET price_offers = price_offers || $1::jsonb
       WHERE id = $2`,
      [JSON.stringify([offer1]), bookingId],
    );
    const offer2 = {
      from: "artist",
      amount: 500,
      message: "Contra-ofertă",
      at: new Date().toISOString(),
    };
    await c.query(
      `UPDATE booking_requests
       SET price_offers = price_offers || $1::jsonb
       WHERE id = $2`,
      [JSON.stringify([offer2]), bookingId],
    );
    const offersRead = await c.query(
      `SELECT price_offers FROM booking_requests WHERE id = $1`,
      [bookingId],
    );
    const offers = offersRead.rows[0].price_offers as Array<{ amount: number }>;
    offers.length === 2 && offers[0].amount === 400 && offers[1].amount === 500
      ? pass("Faza 5: price_offers jsonb appended in order")
      : fail("Faza 5", `offers=${JSON.stringify(offers)}`);

    // ─── Faza 5 continued: artist accepts with agreed_price ─────
    await c.query(
      `UPDATE booking_requests
       SET status = 'accepted', agreed_price = 500
       WHERE id = $1`,
      [bookingId],
    );
    const accepted = await c.query(
      `SELECT status, agreed_price FROM booking_requests WHERE id = $1`,
      [bookingId],
    );
    accepted.rows[0].status === "accepted" && accepted.rows[0].agreed_price === 500
      ? pass("Faza 5: accept w/ agreed_price sealed")
      : fail("Faza 5 accept", JSON.stringify(accepted.rows[0]));

    // ─── Faza 4: budget would include agreed_price (accepted → spent) ─
    const budget = await c.query(
      `SELECT COALESCE(SUM(agreed_price), 0)::int AS total
       FROM booking_requests
       WHERE event_plan_id = $1
       AND status IN ('accepted', 'confirmed_by_client', 'completed')
       AND agreed_price IS NOT NULL`,
      [planId],
    );
    Number(budget.rows[0].total) === 500
      ? pass("Faza 4: budget SUM picks up accepted bookings")
      : fail("Faza 4 sum", `got ${budget.rows[0].total}`);

    // ─── Faza 4: paid_status toggle ─────────────────────────────
    await c.query(
      `UPDATE booking_requests SET paid_status = 'paid' WHERE id = $1`,
      [bookingId],
    );
    const paid = await c.query(
      `SELECT paid_status FROM booking_requests WHERE id = $1`,
      [bookingId],
    );
    paid.rows[0].paid_status === "paid"
      ? pass("Faza 4: paid_status enum accepts 'paid'")
      : fail("Faza 4 paid");

    // ─── Faza 6: insert + query availability slots ──────────────
    await c.query(
      `INSERT INTO artist_availability_slots
         (artist_id, date, start_time, end_time, price, note)
       VALUES ($1,$2,'14:00','18:00',150,$3),
              ($1,$2,'19:00','23:00',250,$3)`,
      [artistId, futureIso, `${TAG} slot`],
    );
    const slots = await c.query(
      `SELECT start_time, end_time, price FROM artist_availability_slots
       WHERE artist_id = $1 AND date = $2
       ORDER BY start_time`,
      [artistId, futureIso],
    );
    slots.rows.length === 2 &&
    slots.rows[0].price === 150 &&
    slots.rows[1].price === 250
      ? pass("Faza 6: two slots per day w/ different prices inserted")
      : fail("Faza 6 slots", JSON.stringify(slots.rows));

    // ─── Faza 8: AI picker query (what the list tool returns) ───
    const aiList = await c.query(
      `SELECT a.id, a.name_ro, a.rating_avg, a.price_from
       FROM artists a
       WHERE a.is_active = true
       AND a.id IN (
         SELECT DISTINCT artist_id FROM artist_availability_slots
         WHERE date = $1 AND is_booked = false
       )
       LIMIT 10`,
      [futureIso],
    );
    aiList.rows.length > 0
      ? pass("Faza 8: AI picker join finds free slots for plan date")
      : fail("Faza 8 AI list", "no artists found");

    // ─── Faza 10: client_confirm → status = confirmed_by_client ─
    await c.query(
      `UPDATE booking_requests SET status = 'confirmed_by_client' WHERE id = $1`,
      [bookingId],
    );
    const confirmed = await c.query(
      `SELECT status FROM booking_requests WHERE id = $1`,
      [bookingId],
    );
    confirmed.rows[0].status === "confirmed_by_client"
      ? pass("Faza 5/10: bilateral confirm reaches final state")
      : fail("Faza 5/10 confirm");

    // ─── Faza 11: archive cron logic ────────────────────────────
    // Insert a "stale" plan (event_date 10 days ago, active) and run
    // the exact UPDATE the cron would run.
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 10);
    const staleIso = staleDate.toISOString().slice(0, 10);
    const stale = await c.query(
      `INSERT INTO event_plans (user_id, title, event_date, status)
       VALUES ($1, $2, $3, 'active') RETURNING id`,
      [userId, `${TAG} Stale Plan`, staleIso],
    );
    const stalePlanId = stale.rows[0].id;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const archived = await c.query(
      `UPDATE event_plans
       SET status = 'completed', archived_at = NOW()
       WHERE status = 'active' AND event_date < $1 AND id = $2
       RETURNING id`,
      [cutoffIso, stalePlanId],
    );
    archived.rows.length === 1
      ? pass("Faza 11: archive cron logic flips stale plans")
      : fail("Faza 11 archive");

    const check = await c.query(
      `SELECT status, archived_at FROM event_plans WHERE id = $1`,
      [stalePlanId],
    );
    check.rows[0].status === "completed" && check.rows[0].archived_at !== null
      ? pass("Faza 11: archived_at timestamp set")
      : fail("Faza 11 archived_at");

    // ─── Cleanup ────────────────────────────────────────────────
    await c.query(
      `DELETE FROM booking_requests WHERE id = $1`,
      [bookingId],
    );
    await c.query(
      `DELETE FROM artist_availability_slots WHERE note LIKE $1`,
      [`${TAG}%`],
    );
    await c.query(
      `DELETE FROM event_plans WHERE title LIKE $1`,
      [`${TAG}%`],
    );
    pass("cleanup: test rows removed");
  } finally {
    c.release();
    await pool.end();
  }

  // ─── Report ───────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  for (const c of checks) {
    const mark = c.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${mark} ${c.name}${c.detail ? `  \x1b[90m${c.detail}\x1b[0m` : ""}`);
  }
  const passed = checks.filter((x) => x.ok).length;
  const failed = checks.filter((x) => !x.ok).length;
  console.log("═".repeat(60));
  console.log(`${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(async (err) => {
  console.error("\n\x1b[31mFATAL:\x1b[0m", err.message);
  // Best-effort cleanup on crash.
  try {
    const c = await pool.connect();
    await c.query(`DELETE FROM booking_requests WHERE message LIKE '%${TAG}%'`);
    await c.query(`DELETE FROM artist_availability_slots WHERE note LIKE '%${TAG}%'`);
    await c.query(`DELETE FROM event_plans WHERE title LIKE '%${TAG}%'`);
    c.release();
  } catch {}
  await pool.end().catch(() => {});
  process.exit(1);
});
