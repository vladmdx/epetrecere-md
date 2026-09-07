import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { completionDateFixtures, assertCompletionDateTargets, simulateQaCompletionDate } from './vendor-qa-completion-date.mjs';

const marker = 'bf3071fe-6487-4668-a756-24ceea64e4ea';
const ids = { artist: 'c661e658-4e4b-4b01-9879-6199a4b4240b', venue: 'da5bb63b-e775-452c-8f50-f02daa09a2af',
  client: '61ff3772-a3cc-4e41-bdbb-76a12391981b', admin: 'ccf5e468-e319-4c09-bbe4-fc22d42b0183' };
const fixtureState = () => ({ marker, users: Object.fromEntries(Object.entries(ids).map(([persona, id]) =>
  [persona, { id, clerkId: `user_QA${persona}`, email: `qa-${persona}-${marker}@invalid.epetrecere.md` }])) });
const fixtureRows = () => [{ id: 256, artist_id: null, venue_id: 24, artist_user_id: null, venue_user_id: ids.venue },
  { id: 257, artist_id: 561, venue_id: null, artist_user_id: ids.artist, venue_user_id: null }].map(row => ({ ...row,
    client_user_id: ids.client, client_email: `qa-client-${marker}@invalid.epetrecere.md`, event_plan_id: 99,
    plan_user_id: ids.client, event_date: '2026-09-20', status: 'confirmed_by_client',
    confirmed_at: '2026-09-07T10:00:00Z', client_confirmed_at: '2026-09-07T09:50:00Z', invariant_hash: `protected-${row.id}`,
  }));

test('time simulation is hard-closed to the original four fixture accounts and a single run', () => {
  assert.equal(completionDateFixtures(fixtureState()).client.id, ids.client);
  for (const state of [
    { ...fixtureState(), marker: '00000000-0000-4000-8000-000000000000' },
    { ...fixtureState(), completionDateSimulation: { phase: 'prepared' } },
    { ...fixtureState(), users: { ...fixtureState().users, client: { ...fixtureState().users.client, id: ids.artist } } },
  ]) assert.throws(() => completionDateFixtures(state), /Refusing/);
});

test('both exact bookings must be finally confirmed, future-dated, and owned by the fixture client/vendors/plan', () => {
  const fixtures = completionDateFixtures(fixtureState());
  assert.doesNotThrow(() => assertCompletionDateTargets(fixtureRows(), fixtures, '2026-09-07'));
  for (const rows of [[], fixtureRows().slice(0, 1), [fixtureRows()[0], fixtureRows()[0]],
    [...fixtureRows(), { ...fixtureRows()[0], id: 258 }]]) {
    assert.throws(() => assertCompletionDateTargets(rows, fixtures, '2026-09-07'), /exactly two/);
  }
  for (const mutation of [
    { id: 258 }, { venue_id: 25 }, { artist_id: 561 }, { client_user_id: ids.artist }, { client_email: 'real@example.com' },
    { event_plan_id: 100 }, { plan_user_id: ids.artist }, { event_date: '2026-09-21' }, { venue_user_id: ids.artist },
    { status: 'pending' }, { status: 'accepted' }, { status: 'completed' }, { confirmed_at: null }, { client_confirmed_at: null },
  ]) {
    assert.throws(() => assertCompletionDateTargets([{ ...fixtureRows()[0], ...mutation }, fixtureRows()[1]], fixtures, '2026-09-07'), /does not match/);
  }
  assert.throws(() => assertCompletionDateTargets(fixtureRows(), fixtures, '2026-09-20'), /still be in the future/);
});

function harness(options = {}) {
  const state = fixtureState();
  let records = fixtureRows();
  const events = [], receipts = [], queries = [];
  let writes = 0, commits = 0, rollbacks = 0;
  const sql = { async begin(mode, run) {
    assert.equal(mode, 'isolation level serializable');
    const snapshot = structuredClone(records);
    events.push('begin');
    try {
      const result = await run(async (strings, ...values) => {
        const query = strings.join('?').trim();
        queries.push(query);
        if (query.startsWith('SET LOCAL')) return [];
        if (query.includes('FROM users')) {
          const fixture = Object.values(state.users).find(user => user.id === values[0]);
          assert.deepEqual(values, [fixture.id, fixture.clerkId, fixture.email]);
          return [{ id: fixture.id, clerk_id: fixture.clerkId, email: fixture.email, phone: options.unsafePhone ? '+12025550123' : 'QA TEST' }];
        }
        if (query.includes('AS yesterday')) return [{ today: '2026-09-07', yesterday: '2026-09-06' }];
        if (query.includes('FOR UPDATE OF b')) return structuredClone(options.pending ? records.map(row => ({ ...row, status: 'pending' })) : records);
        if (query.includes('AS count FROM booking_requests')) return [{ count: options.outOfScope ? 1 : 0 }];
        if (query.includes('FROM commissions')) return options.badFees ? [] : [
          { id: 1, booking_request_id: 256, vendor_type: 'venue', artist_id: null, venue_id: 24 },
          { id: 2, booking_request_id: 257, vendor_type: 'artist', artist_id: 561, venue_id: null },
        ];
        if (query.includes('FROM reviews')) return [{ count: options.existingReview ? 1 : 0 }];
        if (query.startsWith('UPDATE booking_requests')) {
          events.push('update'); writes++;
          assert.equal(receipts.length, 1, 'original dates must be durably captured before mutation');
          assert.equal(values[0], '2026-09-06');
          assert.equal(values[1], '2026-09-20');
          records = records.map(row => ({ ...row, event_date: values[0], updated_at: 'simulated-update' }));
          const returned = records.map(row => ({ id: row.id, event_date: row.event_date, invariant_hash: options.protectedDrift ? 'changed' : row.invariant_hash }));
          return options.partialReturn ? returned.slice(0, 1) : returned;
        }
        throw new Error('Unexpected query in isolated test');
      });
      events.push('commit'); commits++;
      return result;
    } catch (error) { records = snapshot; events.push('rollback'); rollbacks++; throw error; }
  } };
  const resolveExactFixture = async persona => {
    events.push(`resolve:${persona}`);
    if (options.identityFailure) throw new Error('Clerk identity mismatch');
    const user = state.users[persona];
    return { user, appUser: { id: user.id, clerk_id: user.clerkId, email: user.email } };
  };
  const persistState = async () => {
    events.push('persist');
    if (options.diskFailure || (options.postCommitDiskFailure && commits > 0)) throw new Error('Disk unavailable');
    receipts.push(structuredClone(state.completionDateSimulation));
  };
  return { run: () => simulateQaCompletionDate({ sql, state, resolveExactFixture, persistState }),
    state, events, receipts, queries, records: () => records, counts: () => ({ writes, commits, rollbacks }) };
}

test('successful simulation checks identities before locks, saves originals first, and logs only target IDs/dates', async () => {
  const h = harness();
  const report = await h.run();
  assert.deepEqual(h.events.slice(0, 5), ['resolve:artist', 'resolve:venue', 'resolve:client', 'resolve:admin', 'begin']);
  assert.deepEqual(h.events.slice(-4), ['persist', 'update', 'commit', 'persist']);
  assert.deepEqual(report, { kind: 'time-passage-not-reschedule', rowsChanged: 2, changes: [
    { id: 256, oldDate: '2026-09-20', newDate: '2026-09-06' }, { id: 257, oldDate: '2026-09-20', newDate: '2026-09-06' },
  ] });
  assert.equal(h.receipts[0].phase, 'prepared');
  assert.equal(h.receipts[1].phase, 'applied');
  assert.deepEqual(h.counts(), { writes: 1, commits: 1, rollbacks: 0 });
  assert.ok(!JSON.stringify(report).includes('@'));
  for (const row of h.records()) assert.equal(row.status, 'confirmed_by_client');
});

test('foreign related records, pending status, unsafe contacts or missing fees abort before mutation', async () => {
  for (const options of [{ outOfScope: true }, { pending: true }, { unsafePhone: true }, { badFees: true }, { existingReview: true }]) {
    const h = harness(options);
    await assert.rejects(h.run, /Refusing/);
    assert.deepEqual(h.records(), fixtureRows());
    assert.deepEqual(h.counts(), { writes: 0, commits: 0, rollbacks: 1 });
    assert.deepEqual(h.receipts, []);
  }
});

test('partial updates or protected field drift roll back both rows and leave a prepared recovery receipt', async () => {
  for (const options of [{ partialReturn: true }, { protectedDrift: true }]) {
    const h = harness(options);
    await assert.rejects(h.run, /rolling back/);
    assert.deepEqual(h.records(), fixtureRows());
    assert.deepEqual(h.counts(), { writes: 1, commits: 0, rollbacks: 1 });
    assert.equal(h.state.completionDateSimulation.phase, 'prepared');
    assert.throws(() => completionDateFixtures(h.state), /prior simulation receipt/);
  }
});

test('identity and initial receipt failures never write; post-commit receipt failure is reported truthfully', async () => {
  const identity = harness({ identityFailure: true });
  await assert.rejects(identity.run, /Clerk identity mismatch/);
  assert.deepEqual(identity.counts(), { writes: 0, commits: 0, rollbacks: 0 });
  const disk = harness({ diskFailure: true });
  await assert.rejects(disk.run, /Disk unavailable/);
  assert.deepEqual(disk.counts(), { writes: 0, commits: 0, rollbacks: 1 });
  const afterCommit = harness({ postCommitDiskFailure: true });
  await assert.rejects(afterCommit.run, /dates committed/);
  assert.deepEqual(afterCommit.counts(), { writes: 1, commits: 1, rollbacks: 0 });
  assert.equal(afterCommit.records()[0].event_date, '2026-09-06');
});

test('only date and updated_at can be changed; product notifications and legal/calendar writes are absent', () => {
  const source = readFileSync(new URL('./vendor-qa-completion-date.mjs', import.meta.url), 'utf8');
  assert.match(source, /UPDATE booking_requests b SET event_date = \$\{clock\.yesterday\}::date, updated_at = NOW\(\)/);
  assert.equal((source.match(/UPDATE booking_requests/g) ?? []).length, 1);
  assert.doesNotMatch(source, /(?:UPDATE|INSERT INTO|DELETE FROM) (?:commissions|reviews|legal_acceptances|calendar_entries|event_plans)/);
  assert.doesNotMatch(source, /dispatchNotification|sendEmail|sendWhatsApp/);
  const main = readFileSync(new URL('./vendor-live-qa.mjs', import.meta.url), 'utf8');
  assert.match(main, /simulateQaCompletionDate\(\{ sql, state, resolveExactFixture, persistState: save \}\)/);
});
