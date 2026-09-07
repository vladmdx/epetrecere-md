/** QA-only time passage, NOT a real reschedule. Never imports product code,
 * sends notifications, changes status, or rewrites signed evidence. */
import { assertQaFixture, assertQaAppUser } from './vendor-qa-safety.mjs';

const marker = 'bf3071fe-6487-4668-a756-24ceea64e4ea';
const appIds = {
  artist: 'c661e658-4e4b-4b01-9879-6199a4b4240b',
  venue: 'da5bb63b-e775-452c-8f50-f02daa09a2af',
  client: '61ff3772-a3cc-4e41-bdbb-76a12391981b',
  admin: 'ccf5e468-e319-4c09-bbe4-fc22d42b0183',
};
const originalDate = '2026-09-20';
const targets = [{ id: 256, artistId: null, venueId: 24 }, { id: 257, artistId: 561, venueId: null }];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const refuse = reason => { throw new Error(`Refusing QA time simulation: ${reason}`); };

export function completionDateFixtures(state) {
  if (state?.marker !== marker) refuse('unexpected fixture marker');
  if (state.completionDateSimulation) refuse('a prior simulation receipt exists; inspect it before retrying');
  return Object.fromEntries(Object.entries(appIds).map(([persona, id]) => {
    const fixture = assertQaFixture(state, persona);
    if (fixture.id !== id) refuse('unexpected fixture account');
    return [persona, fixture];
  }));
}

export function assertCompletionDateTargets(rows, fixtures, today) {
  if (!datePattern.test(today) || originalDate <= today) refuse('the original event date must still be in the future');
  if (!Array.isArray(rows) || rows.length !== 2 || new Set(rows.map(row => row.id)).size !== 2) refuse('exactly two distinct target bookings are required');
  for (const target of targets) {
    const row = rows.find(candidate => candidate.id === target.id);
    if (!row || row.artist_id !== target.artistId || row.venue_id !== target.venueId ||
        row.client_user_id !== fixtures.client.id || row.client_email !== fixtures.client.email ||
        row.event_plan_id !== 99 || row.plan_user_id !== fixtures.client.id ||
        row.event_date !== originalDate || row.status !== 'confirmed_by_client' ||
        !row.confirmed_at || !row.client_confirmed_at ||
        (target.artistId !== null && row.artist_user_id !== fixtures.artist.id) ||
        (target.venueId !== null && row.venue_user_id !== fixtures.venue.id)) {
      refuse('target ownership, plan, final confirmation or original date does not match');
    }
  }
}

export async function simulateQaCompletionDate({ sql, state, resolveExactFixture, persistState }) {
  const fixtures = completionDateFixtures(state);
  // The shared resolver checks the DB triplet and the current primary Clerk
  // email. Complete external identity calls before acquiring database locks.
  for (const [persona, fixture] of Object.entries(fixtures)) {
    const resolved = await resolveExactFixture(persona);
    assertQaAppUser([resolved.appUser], fixture);
  }
  const report = await sql.begin('isolation level serializable', async tx => {
    await tx`SET LOCAL lock_timeout = '5s'`;
    await tx`SET LOCAL statement_timeout = '15s'`;
    for (const [persona, fixture] of Object.entries(fixtures)) {
      const rows = await tx`SELECT id, clerk_id, email, phone FROM users
        WHERE id = ${fixture.id} AND clerk_id = ${fixture.clerkId} AND email = ${fixture.email} FOR UPDATE`;
      const user = assertQaAppUser(rows, fixture);
      if (persona !== 'admin' && user.phone !== 'QA TEST') refuse('restore safe-contact for client and both vendors first');
    }
    const [clock] = await tx`SELECT
      to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS today,
      to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 1, 'YYYY-MM-DD') AS yesterday`;
    if (!clock || !datePattern.test(clock.yesterday) || clock.yesterday >= clock.today) refuse('invalid database UTC clock');
    const rows = await tx`SELECT b.id, b.artist_id, b.venue_id, b.client_user_id, b.client_email,
      b.event_plan_id, b.event_date::text, b.status, b.confirmed_at, b.client_confirmed_at,
      a.user_id AS artist_user_id, v.user_id AS venue_user_id, p.user_id AS plan_user_id,
      md5((to_jsonb(b) - 'event_date' - 'updated_at')::text) AS invariant_hash
      FROM booking_requests b LEFT JOIN artists a ON a.id = b.artist_id
      LEFT JOIN venues v ON v.id = b.venue_id LEFT JOIN event_plans p ON p.id = b.event_plan_id
      WHERE b.id IN (256, 257) ORDER BY b.id FOR UPDATE OF b`;
    assertCompletionDateTargets(rows, fixtures, clock.today);
    const [related] = await tx`SELECT count(*)::int AS count FROM booking_requests b
      LEFT JOIN artists a ON a.id = b.artist_id LEFT JOIN venues v ON v.id = b.venue_id
      WHERE (b.client_user_id = ${fixtures.client.id} OR a.user_id = ${fixtures.artist.id}
        OR v.user_id = ${fixtures.venue.id} OR b.event_plan_id = 99) AND b.id NOT IN (256, 257)`;
    if (!related || related.count !== 0) refuse('unexpected related bookings');
    const fees = await tx`SELECT id, booking_request_id, vendor_type, artist_id, venue_id
      FROM commissions WHERE booking_request_id IN (256, 257) OR artist_id = 561 OR venue_id = 24 ORDER BY id`;
    if (fees.length !== 2 || targets.some(target => !fees.some(fee => fee.booking_request_id === target.id &&
      fee.artist_id === target.artistId && fee.venue_id === target.venueId && fee.vendor_type === (target.artistId ? 'artist' : 'venue')))) {
      refuse('missing or out-of-scope commission rows');
    }
    const [feedback] = await tx`SELECT count(*)::int AS count FROM reviews
      WHERE booking_request_id IN (256, 257) OR artist_id = 561 OR venue_id = 24 OR author_user_id = ${fixtures.client.id}`;
    if (!feedback || feedback.count !== 0) refuse('reviews already exist for this QA scope');
    const changes = targets.map(target => ({ id: target.id, oldDate: originalDate, newDate: clock.yesterday }));
    // Preserve original dates on disk BEFORE any write. If saving fails, the
    // transaction aborts. A prepared receipt after an error deliberately
    // blocks retries until the operator checks the real DB state.
    state.completionDateSimulation = { kind: 'time-passage-not-reschedule', phase: 'prepared', changes };
    await persistState();
    const updated = await tx`UPDATE booking_requests b SET event_date = ${clock.yesterday}::date, updated_at = NOW()
      WHERE b.id IN (256, 257) AND b.status = 'confirmed_by_client' AND b.event_date = ${originalDate}::date
        AND b.client_user_id = ${fixtures.client.id} AND b.client_email = ${fixtures.client.email} AND b.event_plan_id = 99
        AND ((b.id = 256 AND b.venue_id = 24 AND b.artist_id IS NULL
          AND EXISTS (SELECT 1 FROM venues v WHERE v.id = b.venue_id AND v.user_id = ${fixtures.venue.id}))
        OR (b.id = 257 AND b.artist_id = 561 AND b.venue_id IS NULL
          AND EXISTS (SELECT 1 FROM artists a WHERE a.id = b.artist_id AND a.user_id = ${fixtures.artist.id})))
        AND EXISTS (SELECT 1 FROM event_plans p WHERE p.id = b.event_plan_id AND p.user_id = ${fixtures.client.id})
      RETURNING b.id, b.event_date::text, md5((to_jsonb(b) - 'event_date' - 'updated_at')::text) AS invariant_hash`;
    if (updated.length !== 2 || targets.some(target => {
      const row = updated.find(candidate => candidate.id === target.id);
      return !row || row.event_date !== clock.yesterday || row.invariant_hash !== rows.find(before => before.id === target.id).invariant_hash;
    })) refuse('changed rows or protected booking fields differ; rolling back');
    return { kind: 'time-passage-not-reschedule', rowsChanged: updated.length, changes };
  });
  // This runs only after COMMIT. Failure here leaves the prepared receipt as
  // a recovery marker; never infer that a post-commit filesystem error rolled
  // back the database operation.
  state.completionDateSimulation.phase = 'applied';
  try { await persistState(); } catch { throw new Error('QA dates committed, but applied receipt could not be saved. Inspect before retrying.'); }
  return report;
}
