import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { qaFeeFixtures, appendedQaFeeNote, assertQaFeeTargets, cancelQaFees, qaFeeNote } from './vendor-qa-cancel-fees.mjs';

const marker = 'bf3071fe-6487-4668-a756-24ceea64e4ea';
const ids = { artist: 'c661e658-4e4b-4b01-9879-6199a4b4240b', venue: 'da5bb63b-e775-452c-8f50-f02daa09a2af',
  client: '61ff3772-a3cc-4e41-bdbb-76a12391981b', admin: 'ccf5e468-e319-4c09-bbe4-fc22d42b0183' };
const fixture = () => ({ marker, users: Object.fromEntries(Object.entries(ids).map(([persona, id]) =>
  [persona, { id, clerkId: `user_QA${persona}`, email: `qa-${persona}-${marker}@invalid.epetrecere.md` }])) });
const rows = () => [{ id: 31, booking_request_id: 256, vendor_type: 'venue', artist_id: null, venue_id: 24,
  amount: '200.00', rate_bps: null, base_amount: 1800, artist_user_id: null, venue_user_id: ids.venue },
{ id: 32, booking_request_id: 257, vendor_type: 'artist', artist_id: 561, venue_id: null,
  amount: '15.00', rate_bps: 500, base_amount: 300, artist_user_id: ids.artist, venue_user_id: null }].map(row => ({ ...row,
  booking_artist_id: row.artist_id, booking_venue_id: row.venue_id, currency: 'EUR', status: 'pending',
  payment_note: row.id === 31 ? 'Existing QA note' : null, payment_method: null, paid_at: null, paid_by: null,
  due_date: '2026-10-07', booking_status: 'completed', agreed_price: row.base_amount,
  client_user_id: ids.client, client_email: `qa-client-${marker}@invalid.epetrecere.md`, event_plan_id: 99,
  event_type: 'wedding', confirmed_at: '2026-09-07T12:00:00Z', client_confirmed_at: '2026-09-07T11:59:00Z',
  plan_user_id: ids.client, invariant_hash: `invariant-${row.id}`,
}));

test('fee cleanup requires exact two unpaid completed QA bookings and exact 15/200 EUR fees', () => {
  const users = qaFeeFixtures(fixture());
  assert.doesNotThrow(() => assertQaFeeTargets(rows(), users));
  for (const changes of [{ booking_request_id: 258 }, { artist_id: 562 }, { client_user_id: ids.admin },
    { venue_user_id: ids.admin }, { amount: 201 }, { currency: 'MDL' }, { base_amount: 1801 }, { event_plan_id: 100 },
    { booking_status: 'accepted' }, { booking_status: 'confirmed_by_client' }, { status: 'paid' }, { status: 'invoiced' },
    { paid_at: '2026-09-07' }, { paid_by: ids.admin }, { payment_method: 'manual' }, { confirmed_at: null }]) {
    assert.throws(() => assertQaFeeTargets([{ ...rows()[0], ...changes }, rows()[1]], users), /Refusing/);
  }
  assert.throws(() => assertQaFeeTargets(rows().slice(0, 1), users), /exactly two/);
  assert.throws(() => qaFeeFixtures({ ...fixture(), marker: 'other' }), /Refusing/);
});

test('cleanup note is appended without destroying the previous note', () => {
  assert.equal(appendedQaFeeNote('Prior note\nkept intact'), `Prior note\nkept intact\n${qaFeeNote}`);
  assert.equal(appendedQaFeeNote(null), qaFeeNote);
});

function harness(options = {}) {
  const state = fixture(); let data = rows(), commits = 0, rollbacks = 0, writes = 0;
  const receipts = [];
  const sql = { async begin(_mode, body) {
    const before = structuredClone(data);
    try {
      const result = await body(async (strings, ...values) => {
        const query = strings.join('?').trim();
        if (query.startsWith('SET LOCAL')) return [];
        if (query.includes('FROM users')) {
          const u = Object.values(state.users).find(u => u.id === values[0]);
          return [{ id: u.id, clerk_id: u.clerkId, email: u.email }];
        }
        if (query.includes('FOR UPDATE OF c, b')) return structuredClone(data);
        if (query.startsWith('SELECT count(*)')) return [{ count: options.foreignFees ? 1 : 0 }];
        if (query.startsWith('UPDATE commissions')) {
          assert.equal(receipts[0]?.phase, 'prepared'); writes++;
          const [note, id] = values; const row = data.find(row => row.id === id);
          row.status = 'cancelled'; row.payment_note = note;
          if (options.secondWriteFailure && writes === 2) throw new Error('write failed');
          return [{ id, status: row.status, payment_note: row.payment_note,
            invariant_hash: options.changedAmount ? 'drift' : row.invariant_hash }];
        }
        throw new Error('Unexpected mock query');
      }); commits++; return result;
    } catch (error) { data = before; rollbacks++; throw error; }
  } };
  const run = () => cancelQaFees({ sql, state,
    resolveExactFixture: async persona => { const u = state.users[persona]; return { appUser: { id: u.id, clerk_id: u.clerkId, email: u.email } }; },
    persistState: async () => { if (options.diskFailure) throw new Error('Disk failed'); receipts.push(structuredClone(state.feeCleanup)); },
  });
  return { run, state, receipts, data: () => data, counts: () => ({ commits, rollbacks, writes }) };
}

test('successful cleanup saves originals before writes and an applied receipt, repeated run is no-op', async () => {
  const h = harness(); const result = await h.run();
  assert.equal(result.rowsChanged, 2); assert.equal(h.receipts[0].phase, 'prepared');
  assert.equal(h.receipts[1].phase, 'applied'); assert.equal(h.receipts[0].originals[0].status, 'pending');
  assert.equal(h.receipts[0].originals[0].paymentNote, 'Existing QA note');
  assert.equal(h.data()[0].payment_note, `Existing QA note\n${qaFeeNote}`);
  assert.deepEqual(h.counts(), { commits: 1, rollbacks: 0, writes: 2 });
  assert.equal((await h.run()).noOp, true); assert.equal(h.counts().writes, 2);
  for (const row of h.data()) { assert.equal(row.due_date, '2026-10-07'); assert.equal(row.paid_at, null); }
});

test('partial failure or invariant drift rolls back both fees and blocks blind retry', async () => {
  for (const options of [{ secondWriteFailure: true }, { changedAmount: true }]) {
    const h = harness(options); await assert.rejects(h.run);
    assert.deepEqual(h.data(), rows()); assert.equal(h.counts().rollbacks, 1); assert.equal(h.counts().commits, 0);
    assert.equal(h.state.feeCleanup.phase, 'prepared'); await assert.rejects(h.run, /unresolved receipt/);
  }
});

test('foreign fees or inability to save the original receipt abort before writes', async () => {
  for (const options of [{ foreignFees: true }, { diskFailure: true }]) {
    const h = harness(options); await assert.rejects(h.run);
    assert.equal(h.counts().writes, 0); assert.deepEqual(h.data(), rows());
  }
});

test('cleanup never changes bookings, legal evidence, financial amounts or deadlines', () => {
  const source = readFileSync(new URL('./vendor-qa-cancel-fees.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:DELETE|INSERT|TRUNCATE)\s+(?:FROM|INTO)?\s*(?:commissions|booking_requests|legal_acceptances)/i);
  assert.doesNotMatch(source, /UPDATE (?:booking_requests|legal_acceptances|users)/i);
  assert.match(source, /UPDATE commissions c SET status = 'cancelled', payment_note = \$\{note\}, updated_at = NOW\(\)/);
  assert.doesNotMatch(source, /\bSET\s+(?:amount|due_date|paid_at|paid_by|currency|rate_bps)\b/i);
});
