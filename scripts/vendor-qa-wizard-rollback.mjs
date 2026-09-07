/** Live DB constraint/transaction probe, NOT HTTP endpoint E2E.
 * The only owner permitted is the existing synthetic QA client. All writes
 * live inside an unconditionally rolled-back transaction. Explicit negative
 * IDs avoid consuming serial values (PostgreSQL sequences do not roll back).
 * Never changes schema, existing plans, signed evidence, users or messages.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { assertQaFixture, assertQaAppUser } from './vendor-qa-safety.mjs';

const marker = 'bf3071fe-6487-4668-a756-24ceea64e4ea';
const clientId = '61ff3772-a3cc-4e41-bdbb-76a12391981b';
const clerkId = 'user_3Iy0vCo98WKc1qeHw3uOdFuhGNa';
const missingOwner = '00000000-0000-0000-0000-000000000000';
const planIds = [-1906090701, -1906090702, -1906090703];
const itemIds = [-1906090711, -1906090712, -1906090713, -1906090714];
const indexName = 'event_plans_user_wizard_submission_uidx';
const refuse = reason => { throw new Error(`Refusing wizard rollback QA: ${reason}`); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function wizardRollbackFixture(state) {
  const user = assertQaFixture(state, 'client');
  if (state.marker !== marker || user.id !== clientId || user.clerkId !== clerkId) refuse('unexpected fixture client');
  return user;
}

export async function rollbackOnly(sql, body) {
  // A callback return must NEVER let postgres.js commit, even if later edits
  // accidentally add an early success return to body(). An unexpected error
  // also causes postgres.js to roll back and is rethrown to the caller.
  const rollback = new Error('Expected isolated QA rollback');
  let result;
  try {
    await sql.begin('isolation level serializable', async tx => {
      result = await body(tx);
      throw rollback;
    });
    throw new Error('QA rollback was not observed');
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result;
}

async function snapshot(sql, user) {
  const [plans] = await sql`SELECT count(*)::int AS count,
    md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text, '[]')) AS fingerprint
    FROM public.event_plans p WHERE p.user_id = ${user.id}`;
  const [items] = await sql`SELECT count(*)::int AS count,
    md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id)::text, '[]')) AS fingerprint
    FROM public.checklist_items c JOIN public.event_plans p ON p.id = c.plan_id
    WHERE p.user_id = ${user.id}`;
  return { plans, items };
}

async function assertNoReservedRows(sql, submissionId, failedSubmissionId) {
  const [plans] = await sql`SELECT count(*)::int AS count FROM public.event_plans
    WHERE id IN (-1906090701, -1906090702, -1906090703)
      OR wizard_submission_id IN (${submissionId}::uuid, ${failedSubmissionId}::uuid)`;
  const [items] = await sql`SELECT count(*)::int AS count FROM public.checklist_items
    WHERE id IN (-1906090711, -1906090712, -1906090713, -1906090714)
      OR plan_id IN (-1906090701, -1906090702, -1906090703)`;
  if (plans.count !== 0 || items.count !== 0) refuse('reserved test IDs or keys already exist');
}

async function expectSqlError(tx, code, body, constraint) {
  let received;
  try { await tx.savepoint(body); } catch (error) { received = error; }
  assert.equal(received?.code, code, 'expected PostgreSQL constraint failure');
  if (constraint) assert.equal(received.constraint_name, constraint);
}

export async function testWizardRollback({ sql, state, resolveExactFixture }) {
  const user = wizardRollbackFixture(state);
  // Live Clerk primary-email and exact app triplet checks happen before locks.
  const resolved = await resolveExactFixture('client');
  assertQaAppUser([resolved.appUser], user);
  const submissionId = randomUUID();
  const failedSubmissionId = randomUUID();
  const draft = { eventType: 'wedding', eventDate: '2026-09-20', location: 'Bălți',
    startTime: '14:00', durationHours: 10, guestCount: 60,
    name: 'QA rollback only, never published', checklistEnabled: true };
  const originalHash = hash(draft);
  const changedHash = hash({ ...draft, guestCount: 61 });
  let before;
  const checks = await rollbackOnly(sql, async tx => {
    await tx`SET LOCAL lock_timeout = '5s'`;
    await tx`SET LOCAL statement_timeout = '15s'`;
    await tx`SET LOCAL idle_in_transaction_session_timeout = '15s'`;
    const users = await tx`SELECT id, clerk_id, email, role FROM public.users
      WHERE id = ${user.id} AND clerk_id = ${user.clerkId} AND email = ${user.email} FOR UPDATE`;
    if (assertQaAppUser(users, user).role !== 'user') refuse('QA account is not a client');
    const [foreign] = await tx`SELECT count(*)::int AS count FROM public.users WHERE id = ${missingOwner}`;
    if (foreign.count !== 0) refuse('negative-control owner unexpectedly exists');
    const columns = await tx`SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_plans'
        AND column_name IN ('wizard_submission_id', 'wizard_submission_hash') ORDER BY column_name`;
    assert.deepEqual(columns.map(row => [row.column_name, row.data_type, row.is_nullable]),
      [['wizard_submission_hash', 'text', 'YES'], ['wizard_submission_id', 'uuid', 'YES']]);
    const indexes = await tx`SELECT i.indisunique, i.indisvalid, i.indpred IS NULL AS unfiltered,
      ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ordinal)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum ORDER BY k.ordinal) AS columns
      FROM pg_index i JOIN pg_class n ON n.oid = i.indexrelid
      WHERE i.indrelid = 'public.event_plans'::regclass AND n.relname = ${indexName}`;
    assert.equal(indexes.length, 1);
    assert.deepEqual(indexes[0], { indisunique: true, indisvalid: true, unfiltered: true,
      columns: ['user_id', 'wizard_submission_id'] });
    // Refuse unreviewed application triggers: a rollback cannot necessarily
    // undo a trigger's network request or another external side effect.
    const [triggers] = await tx`SELECT count(*)::int AS count FROM pg_trigger
      WHERE tgrelid IN ('public.event_plans'::regclass, 'public.checklist_items'::regclass)
        AND NOT tgisinternal AND tgenabled <> 'D'`;
    if (triggers.count !== 0) refuse('application triggers need review before write probe');
    await assertNoReservedRows(tx, submissionId, failedSubmissionId);
    before = await snapshot(tx, user);

    await tx`INSERT INTO public.event_plans
      (id, user_id, wizard_submission_id, wizard_submission_hash, title, event_type,
       event_date, start_time, duration_hours, location, guest_count_target, checklist_enabled, moments_enabled)
      VALUES (${planIds[0]}, ${user.id}, ${submissionId}, ${originalHash}, ${draft.name},
        ${draft.eventType}, ${draft.eventDate}, ${draft.startTime}, ${draft.durationHours},
        ${draft.location}, ${draft.guestCount}, true, false)`;
    await tx`INSERT INTO public.checklist_items (id, plan_id, title, category, priority, due_days_before, sort_order)
      VALUES (${itemIds[0]}, ${planIds[0]}, 'QA rollback task A', 'venue', 'high', 30, 0),
        (${itemIds[1]}, ${planIds[0]}, 'QA rollback task B', 'artists', 'medium', 20, 1)`;

    const retry = await tx`SELECT id, wizard_submission_hash, title, event_type, event_date::text,
      start_time, duration_hours, location, guest_count_target, checklist_enabled, moments_enabled
      FROM public.event_plans WHERE user_id = ${user.id} AND wizard_submission_id = ${submissionId}`;
    assert.equal(retry.length, 1);
    assert.deepEqual(retry[0], { id: planIds[0], wizard_submission_hash: originalHash,
      title: draft.name, event_type: draft.eventType, event_date: draft.eventDate,
      start_time: draft.startTime, duration_hours: draft.durationHours, location: draft.location,
      guest_count_target: draft.guestCount, checklist_enabled: true, moments_enabled: false });
    assert.notEqual(retry[0].wizard_submission_hash, changedHash,
      'changed draft is distinguishable; the HTTP handler, not a SQL check constraint, returns 409');
    const otherOwner = await tx`SELECT id FROM public.event_plans
      WHERE user_id = ${missingOwner} AND wizard_submission_id = ${submissionId}`;
    assert.equal(otherOwner.length, 0, 'owner-scoped key lookup does not return another owner plan');

    await expectSqlError(tx, '23505', async inner => {
      await inner`INSERT INTO public.event_plans
        (id, user_id, wizard_submission_id, wizard_submission_hash, title)
        VALUES (${planIds[1]}, ${user.id}, ${submissionId}, ${changedHash}, 'QA duplicate must fail')`;
    }, indexName);
    const [children] = await tx`SELECT count(*)::int AS count FROM public.checklist_items WHERE plan_id = ${planIds[0]}`;
    assert.equal(children.count, 2, 'retry lookup and rejected duplicate did not repeat checklist seeding');

    await expectSqlError(tx, '23502', async inner => {
      await inner`INSERT INTO public.event_plans
        (id, user_id, wizard_submission_id, wizard_submission_hash, title, checklist_enabled)
        VALUES (${planIds[2]}, ${user.id}, ${failedSubmissionId}, ${originalHash}, 'QA atomic failure', true)`;
      await inner`INSERT INTO public.checklist_items (id, plan_id, title)
        VALUES (${itemIds[2]}, ${planIds[2]}, 'QA partial task must also disappear')`;
      await inner`INSERT INTO public.checklist_items (id, plan_id, title)
        VALUES (${itemIds[3]}, ${planIds[2]}, NULL)`;
    });
    const [failedPlan] = await tx`SELECT count(*)::int AS count FROM public.event_plans WHERE id = ${planIds[2]}`;
    const [failedItems] = await tx`SELECT count(*)::int AS count FROM public.checklist_items WHERE plan_id = ${planIds[2]}`;
    assert.equal(failedPlan.count, 0);
    assert.equal(failedItems.count, 0);
    return { migrationColumnsAndUniqueIndex: true, storedWizardFields: true,
      sameOwnerRetryFindsSamePlan: true, changedPayloadHashDistinguished: true,
      ownerScopedLookup: true, duplicateKeySqlstate: '23505', checklistCountAfterRetry: 2,
      atomicChecklistFailureSqlstate: '23502', failedPlanAndPartialChecklistAbsent: true };
  });
  // New transaction snapshot after postgres.js confirms ROLLBACK. These are
  // read-only checks and include fingerprints only for the exact QA owner.
  await assertNoReservedRows(sql, submissionId, failedSubmissionId);
  const after = await snapshot(sql, user);
  assert.deepEqual(after, before, 'existing QA plans/checklists changed during the probe');
  return { kind: 'live-database-rollback-not-http-e2e', checks, rollbackConfirmed: true,
    residualTestPlans: 0, residualTestChecklistItems: 0,
    qaPlanCountBefore: before.plans.count, qaPlanCountAfter: after.plans.count,
    qaChecklistCountBefore: before.items.count, qaChecklistCountAfter: after.items.count,
    existingQaRowsUnchanged: true, explicitIdsAvoidedSerialConsumption: true,
    limitations: ['HTTP 200/409, authentication and concurrent requests are not exercised by this DB probe.',
      'Changed-payload 409 behavior and transaction use are separately covered by source regression tests.'] };
}
