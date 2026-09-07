import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { wizardRollbackFixture, rollbackOnly, testWizardRollback } from './vendor-qa-wizard-rollback.mjs';

const marker = 'bf3071fe-6487-4668-a756-24ceea64e4ea';
const fixture = () => ({ marker, users: { client: {
  id: '61ff3772-a3cc-4e41-bdbb-76a12391981b', clerkId: 'user_3Iy0vCo98WKc1qeHw3uOdFuhGNa',
  email: `qa-client-${marker}@invalid.epetrecere.md`,
} } });

test('wizard DB probe is hard closed to exact original marker, app ID, Clerk ID and marker email', () => {
  assert.equal(wizardRollbackFixture(fixture()).id, fixture().users.client.id);
  for (const change of [{ id: 'c661e658-4e4b-4b01-9879-6199a4b4240b' },
    { clerkId: 'user_other' }, { email: 'real@example.com' }]) {
    const state = fixture(); Object.assign(state.users.client, change);
    assert.throws(() => wizardRollbackFixture(state), /Refusing/);
  }
  assert.throws(() => wizardRollbackFixture({ ...fixture(), marker: '00000000-0000-4000-8000-000000000000' }), /Refusing/);
});

test('a successful or early-returning probe always rolls back, never commits', async () => {
  let commits = 0, rollbacks = 0;
  const db = { async begin(mode, body) {
    assert.equal(mode, 'isolation level serializable');
    try { await body({}); commits++; } catch (error) { rollbacks++; throw error; }
  } };
  assert.deepEqual(await rollbackOnly(db, async () => ({ checked: true })), { checked: true });
  assert.equal(await rollbackOnly(db, async () => undefined), undefined);
  assert.equal(commits, 0); assert.equal(rollbacks, 2);
});

test('unexpected failures also roll back and remain errors rather than false success', async () => {
  let rollbacks = 0;
  const db = { async begin(_mode, body) {
    try { await body({}); } catch (error) { rollbacks++; throw error; }
  } };
  await assert.rejects(rollbackOnly(db, async () => { throw new Error('query failed'); }), /query failed/);
  assert.equal(rollbacks, 1);
});

test('identity mismatch aborts before database transaction entry', async () => {
  let begins = 0;
  await assert.rejects(testWizardRollback({ state: fixture(), sql: { begin() { begins++; } },
    resolveExactFixture: async () => { throw new Error('Clerk mismatch'); } }), /Clerk mismatch/);
  assert.equal(begins, 0);
});

test('probe source uses explicit serial IDs, blocks unreviewed triggers and never updates existing records', () => {
  const source = readFileSync(new URL('./vendor-qa-wizard-rollback.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:UPDATE|DELETE|TRUNCATE|ALTER|DROP|COMMIT)\s+(?:public\.|users|event_plans|checklist_items)/i);
  assert.doesNotMatch(source, /\b(?:nextval|setval)\s*\(/i);
  assert.match(source, /INSERT INTO public\.event_plans\s*\(id, user_id, wizard_submission_id/g);
  assert.match(source, /INSERT INTO public\.checklist_items \(id, plan_id, title/g);
  assert.match(source, /if \(triggers\.count !== 0\) refuse/);
  assert.match(source, /assert\.deepEqual\(after, before/);
  assert.match(source, /FROM public\.event_plans p WHERE p\.user_id = \$\{user\.id\}/);
});
