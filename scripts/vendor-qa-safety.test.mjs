import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertQaFixture, assertQaAppUser, assertQaClerkUser, assertQaSessions, safeQaNotificationPrefs } from './vendor-qa-safety.mjs';
const marker = 'bf3071fe-6487-4668-a756-24ceea64e4ea';
const user = { id: 'c661e658-4e4b-4b01-9879-6199a4b4240b', clerkId: 'user_QAFixture', email: `qa-artist-${marker}@invalid.epetrecere.md` };
const state = { marker, users: { artist: user } };

test('only the known persona, marker namespace and complete identifiers are accepted', () => {
  assert.equal(assertQaFixture(state, 'artist'), user);
  for (const [candidate, persona] of [[state, 'stranger'], [{ ...state, marker: 'anything' }, 'artist'], [{ ...state, users: { artist: { ...user, email: 'real@example.com' } } }, 'artist'], [{ ...state, users: { artist: { ...user, id: '' } } }, 'artist']]) {
    assert.throws(() => assertQaFixture(candidate, persona), /Refusing/);
  }
});

test('all three application identity fields must match exactly one result', () => {
  const row = { id: user.id, clerk_id: user.clerkId, email: user.email };
  assert.equal(assertQaAppUser([row], user), row);
  for (const rows of [[], [row, row], [{ ...row, id: 'other' }], [{ ...row, clerk_id: 'user_Other' }], [{ ...row, email: 'other@example.invalid' }]]) {
    assert.throws(() => assertQaAppUser(rows, user), /Refusing/);
  }
});

test('Clerk primary identity must match the fixture, not just one secondary email', () => {
  const identity = { id: user.clerkId, primaryEmailAddressId: 'email_1', emailAddresses: [{ id: 'email_1', emailAddress: user.email }] };
  assert.doesNotThrow(() => assertQaClerkUser(identity, user));
  assert.throws(() => assertQaClerkUser({ ...identity, id: 'user_Other' }, user), /Refusing/);
  assert.throws(() => assertQaClerkUser({ ...identity, primaryEmailAddressId: 'email_other' }, user), /Refusing/);
});

test('foreign, malformed and inactive sessions are refused before any revocation', () => {
  const session = { id: 'sess_QAFixture', userId: user.clerkId, status: 'active' };
  assert.doesNotThrow(() => assertQaSessions([session], user));
  assert.doesNotThrow(() => assertQaSessions([], user));
  for (const candidate of [{ ...session, userId: 'user_Other' }, { ...session, id: '' }, { ...session, status: 'revoked' }]) {
    assert.throws(() => assertQaSessions([session, candidate], user), /Refusing/);
  }
});

test('existing custom notification overrides cannot bypass muted QA preferences', () => {
  const previous = { custom_event: { email: true, push: true } };
  const prefs = safeQaNotificationPrefs(previous);
  assert.deepEqual(previous.custom_event, { email: true, push: true });
  for (const key of ['custom_event', 'registration_approved', 'booking_updates', 'messages', 'reviews']) {
    assert.deepEqual(prefs[key], { email: false, push: false });
  }
  assert.ok(!'QA TEST'.replace(/\D/g, ''), 'phone cannot be normalized into a WhatsApp destination');
});
