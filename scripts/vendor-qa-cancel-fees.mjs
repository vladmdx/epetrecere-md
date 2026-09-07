/** Final QA cleanup only. Voids synthetic fees, never records a payment or
 * changes completed bookings, amounts, deadlines or signed legal evidence. */
import { assertQaFixture, assertQaAppUser } from './vendor-qa-safety.mjs';

const marker = 'bf3071fe-6487-4668-a756-24ceea64e4ea';
const appIds = { artist: 'c661e658-4e4b-4b01-9879-6199a4b4240b', venue: 'da5bb63b-e775-452c-8f50-f02daa09a2af',
  client: '61ff3772-a3cc-4e41-bdbb-76a12391981b', admin: 'ccf5e468-e319-4c09-bbe4-fc22d42b0183' };
const targets = [{ bookingId: 256, vendorType: 'venue', artistId: null, venueId: 24, amount: 200, rateBps: null, baseAmount: 1800 },
  { bookingId: 257, vendorType: 'artist', artistId: 561, venueId: null, amount: 15, rateBps: 500, baseAmount: 300 }];
export const qaFeeNote = 'QA lifecycle 2026-09-07: synthetic test booking, not a real commercial order. Commission voided after testing; no payment received or recorded.';
const refuse = reason => { throw new Error(`Refusing QA fee cleanup: ${reason}`); };

export function qaFeeFixtures(state) {
  if (state?.marker !== marker) refuse('unexpected fixture marker');
  return Object.fromEntries(Object.entries(appIds).map(([persona, id]) => {
    const user = assertQaFixture(state, persona);
    if (user.id !== id) refuse('unexpected fixture app ID');
    return [persona, user];
  }));
}

export function appendedQaFeeNote(existing) {
  if (existing !== null && typeof existing !== 'string') refuse('unexpected existing payment note');
  return existing ? `${existing}\n${qaFeeNote}` : qaFeeNote;
}

export function assertQaFeeTargets(rows, fixtures, expectedStatus = 'pending') {
  if (!Array.isArray(rows) || rows.length !== 2 || new Set(rows.map(row => row.booking_request_id)).size !== 2) refuse('exactly two distinct QA fees required');
  for (const target of targets) {
    const row = rows.find(row => row.booking_request_id === target.bookingId);
    if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || row.vendor_type !== target.vendorType ||
      row.artist_id !== target.artistId || row.venue_id !== target.venueId ||
      row.booking_artist_id !== target.artistId || row.booking_venue_id !== target.venueId ||
      Number(row.amount) !== target.amount || row.currency !== 'EUR' || row.rate_bps !== target.rateBps ||
      row.base_amount !== target.baseAmount || row.agreed_price !== target.baseAmount ||
      row.client_user_id !== fixtures.client.id || row.client_email !== fixtures.client.email ||
      row.event_plan_id !== 99 || row.plan_user_id !== fixtures.client.id || row.event_type !== 'wedding' ||
      row.booking_status !== 'completed' || !row.confirmed_at || !row.client_confirmed_at ||
      row.status !== expectedStatus || row.paid_at !== null || row.paid_by !== null || row.payment_method !== null ||
      (target.artistId !== null && row.artist_user_id !== fixtures.artist.id) ||
      (target.venueId !== null && row.venue_user_id !== fixtures.venue.id)) refuse('fee amount, status, payment or exact booking ownership mismatch');
  }
}

export async function cancelQaFees({ sql, state, resolveExactFixture, persistState }) {
  const fixtures = qaFeeFixtures(state);
  const prior = state.feeCleanup;
  if (prior && prior.phase !== 'applied') refuse('an unresolved receipt exists; inspect before any retry');
  for (const [persona, fixture] of Object.entries(fixtures)) {
    const resolved = await resolveExactFixture(persona);
    assertQaAppUser([resolved.appUser], fixture);
  }
  const report = await sql.begin('isolation level serializable', async tx => {
    await tx`SET LOCAL lock_timeout = '5s'`;
    await tx`SET LOCAL statement_timeout = '15s'`;
    for (const fixture of Object.values(fixtures)) {
      assertQaAppUser(await tx`SELECT id, clerk_id, email FROM users
        WHERE id = ${fixture.id} AND clerk_id = ${fixture.clerkId} AND email = ${fixture.email} FOR KEY SHARE`, fixture);
    }
    const rows = await tx`SELECT c.id, c.booking_request_id, c.vendor_type, c.artist_id, c.venue_id,
      c.amount, c.currency, c.rate_bps, c.base_amount, c.status, c.payment_note, c.payment_method,
      c.paid_at, c.paid_by, c.due_date::text,
      b.artist_id AS booking_artist_id, b.venue_id AS booking_venue_id, b.status AS booking_status,
      b.agreed_price, b.client_user_id, b.client_email, b.event_plan_id, b.event_type,
      b.confirmed_at, b.client_confirmed_at, a.user_id AS artist_user_id, v.user_id AS venue_user_id,
      p.user_id AS plan_user_id,
      md5((to_jsonb(c) - 'status' - 'payment_note' - 'updated_at')::text) AS invariant_hash
      FROM commissions c JOIN booking_requests b ON b.id = c.booking_request_id
      LEFT JOIN artists a ON a.id = b.artist_id LEFT JOIN venues v ON v.id = b.venue_id
      LEFT JOIN event_plans p ON p.id = b.event_plan_id
      WHERE c.booking_request_id IN (256, 257) ORDER BY c.booking_request_id FOR UPDATE OF c, b`;
    assertQaFeeTargets(rows, fixtures, prior ? 'cancelled' : 'pending');
    const [foreignFees] = await tx`SELECT count(*)::int AS count FROM commissions
      WHERE (artist_id = 561 OR venue_id = 24) AND booking_request_id NOT IN (256, 257)`;
    if (foreignFees.count !== 0) refuse('unexpected additional vendor fees');

    if (prior) {
      if (prior.kind !== 'synthetic-qa-fee-void' || !Array.isArray(prior.originals) || prior.originals.length !== 2 ||
        rows.some(row => !prior.originals.some(original => original.id === row.id && original.bookingId === row.booking_request_id &&
          original.status === 'pending' && original.invariantHash === row.invariant_hash &&
          row.payment_note === appendedQaFeeNote(original.paymentNote)))) refuse('applied receipt does not match current QA fee rows');
      return { kind: 'synthetic-qa-fee-void', noOp: true, rowsChanged: 0, bookingIds: [256, 257] };
    }

    // Original statuses/notes and fingerprints are saved before any update.
    // Recovery is an explicit operator decision, never an automatic overwrite.
    state.feeCleanup = { kind: 'synthetic-qa-fee-void', phase: 'prepared',
      originals: rows.map(row => ({ id: row.id, bookingId: row.booking_request_id, status: row.status,
        paymentNote: row.payment_note, amount: Number(row.amount), currency: row.currency,
        dueDate: row.due_date, invariantHash: row.invariant_hash })), noteAppended: qaFeeNote };
    await persistState();
    for (const row of rows) {
      const note = appendedQaFeeNote(row.payment_note);
      const updated = await tx`UPDATE commissions c SET status = 'cancelled', payment_note = ${note}, updated_at = NOW()
        WHERE c.id = ${row.id} AND c.booking_request_id = ${row.booking_request_id} AND c.status = 'pending'
          AND c.amount = ${Number(row.amount)} AND c.currency = 'EUR' AND c.paid_at IS NULL AND c.paid_by IS NULL
          AND c.payment_method IS NULL
        RETURNING c.id, c.status, c.payment_note,
          md5((to_jsonb(c) - 'status' - 'payment_note' - 'updated_at')::text) AS invariant_hash`;
      if (updated.length !== 1 || updated[0].id !== row.id || updated[0].status !== 'cancelled' ||
        updated[0].payment_note !== note || updated[0].invariant_hash !== row.invariant_hash) refuse('updated fields mismatch; rolling back both fees');
    }
    return { kind: 'synthetic-qa-fee-void', noOp: false, rowsChanged: 2,
      changes: rows.map(row => ({ id: row.id, bookingId: row.booking_request_id, amount: Number(row.amount),
        currency: row.currency, oldStatus: 'pending', newStatus: 'cancelled' })) };
  });
  if (!report.noOp) {
    state.feeCleanup.phase = 'applied';
    try { await persistState(); } catch { throw new Error('QA fees cancelled, but receipt save failed after commit. Inspect before retrying.'); }
  }
  return report;
}
