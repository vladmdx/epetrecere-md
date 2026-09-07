/** Isolated identities for the manual vendor lifecycle QA, never real users. */
import { config } from 'dotenv';
import { createClerkClient } from '@clerk/backend';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { assertQaFixture, assertQaAppUser, assertQaClerkUser, assertQaSessions, qaBookingContact, safeQaNotificationPrefs } from './vendor-qa-safety.mjs';
import { inspectQaLifecycle } from './vendor-qa-lifecycle.mjs';
import { simulateQaCompletionDate } from './vendor-qa-completion-date.mjs';
import { testWizardRollback } from './vendor-qa-wizard-rollback.mjs';

config({ path: '.env.production.local', quiet: true });
const statePath = '/tmp/epetrecere-vendor-qa-20260906.json';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false, max: 1 });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const action = process.argv[2] || 'inspect';
let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { marker: randomUUID(), users: {} };
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });

async function resolveExactFixture(persona) {
  const user = assertQaFixture(state, persona);
  const rows = await sql`SELECT id, clerk_id, email, notification_prefs FROM users
    WHERE id = ${user.id} AND clerk_id = ${user.clerkId} AND email = ${user.email}`;
  const appUser = assertQaAppUser(rows, user);
  assertQaClerkUser(await clerk.users.getUser(user.clerkId), user);
  return { user, appUser };
}

try {
  if (action === 'create') {
    for (const persona of ['artist', 'venue', 'client', 'admin']) {
      if (state.users[persona]) continue;
      const email = `qa-${persona}-${state.marker}@invalid.epetrecere.md`;
      const identity = await clerk.users.createUser({ emailAddress: [email], firstName: 'QA', lastName: `Test ${persona}`, skipPasswordRequirement: true, skipLegalChecks: true });
      state.users[persona] = { clerkId: identity.id, email };
      save();
      const role = persona === 'admin' ? 'admin' : 'user';
      const [row] = await sql`INSERT INTO users (clerk_id, email, name, role, onboarding_complete, language_pref)
        VALUES (${identity.id}, ${email}, ${`QA Test ${persona}`}, ${role}, ${persona === 'admin' || persona === 'client'}, 'ro')
        ON CONFLICT (clerk_id) DO UPDATE SET role = ${role}, onboarding_complete = ${persona === 'admin' || persona === 'client'}
        RETURNING id`;
      state.users[persona].id = row.id;
      save();
    }
    console.log(JSON.stringify(state));
  } else if (action === 'ticket') {
    const persona = process.argv[3];
    if (!state.users[persona]) throw new Error('Unknown QA persona');
    const ticket = await clerk.signInTokens.createSignInToken({ userId: state.users[persona].clerkId, expiresInSeconds: 90 });
    console.log(`https://epetrecere.md/ro/sign-in?__clerk_ticket=${encodeURIComponent(ticket.token)}`);
  } else if (action === 'booking-contact') {
    const persona = process.argv[3];
    // Fail closed before any DB/Clerk lookup for non-client or malformed state.
    const phone = qaBookingContact(state, persona);
    const { user, appUser } = await resolveExactFixture(persona);
    const prefs = safeQaNotificationPrefs(appUser.notification_prefs);
    // Exact app ID + Clerk ID + marker email, checked again at the write.
    // Create both QA requests, then immediately run safe-contact client before
    // any status change. This never changes product validators or delivery.
    const updated = await sql`UPDATE users SET phone = ${phone}, notification_prefs = ${sql.json(prefs)}::jsonb
      WHERE id = ${user.id} AND clerk_id = ${user.clerkId} AND email = ${user.email}
      RETURNING id, clerk_id, email, phone`;
    assertQaAppUser(updated, user);
    if (updated[0].phone !== phone) throw new Error('QA booking contact verification failed');
    console.log(JSON.stringify({ persona, reservedBookingContact: true, optionalNotificationsDisabled: true,
      restoreBeforeStatusChanges: 'node scripts/vendor-live-qa.mjs safe-contact client' }));
  } else if (action === 'safe-contact') {
    const persona = process.argv[3];
    const { user, appUser } = await resolveExactFixture(persona);
    const prefs = safeQaNotificationPrefs(appUser.notification_prefs);
    // WhatsApp strips non-digits; QA TEST therefore cannot become a recipient.
    // The triple predicate is repeated on UPDATE to fail closed if identity changed.
    const updated = await sql`UPDATE users SET phone = 'QA TEST', notification_prefs = ${sql.json(prefs)}::jsonb
      WHERE id = ${user.id} AND clerk_id = ${user.clerkId} AND email = ${user.email}
      RETURNING id, clerk_id, email, phone`;
    assertQaAppUser(updated, user);
    if (updated[0].phone !== 'QA TEST') throw new Error('QA contact safety verification failed');
    console.log(JSON.stringify({ persona, safeContact: true, optionalNotificationsDisabled: true }));
  } else if (action === 'signout') {
    const persona = process.argv[3];
    const { user } = await resolveExactFixture(persona);
    const sessions = [];
    let offset = 0;
    // Capture and validate the complete list BEFORE revoking anything, so
    // pagination cannot skip rows as the active-session collection shrinks.
    while (true) {
      const page = await clerk.sessions.getSessionList({ userId: user.clerkId, status: 'active', limit: 100, offset });
      assertQaSessions(page.data, user);
      if (!Number.isSafeInteger(page.totalCount) || page.totalCount < 0 || page.totalCount > 1000) throw new Error('Unexpected QA session count');
      sessions.push(...page.data);
      offset += page.data.length;
      if (offset >= page.totalCount) break;
      if (!page.data.length || offset >= 1000) throw new Error('Incomplete QA session listing');
    }
    assertQaSessions(sessions, user);
    const unique = [...new Map(sessions.map(session => [session.id, session])).values()];
    for (const session of unique) {
      const revoked = await clerk.sessions.revokeSession(session.id);
      if (revoked.userId !== user.clerkId || revoked.id !== session.id || revoked.status !== 'revoked') throw new Error('QA session revocation could not be verified');
    }
    console.log(JSON.stringify({ persona, revokedSessions: unique.length }));
  } else if (action === 'wizard-rollback') {
    console.log(JSON.stringify(await testWizardRollback({ sql, state, resolveExactFixture }), null, 2));
  } else if (action === 'simulate-completion-date') {
    console.log(JSON.stringify(await simulateQaCompletionDate({ sql, state, resolveExactFixture, persistState: save }), null, 2));
  } else if (action === 'inspect-lifecycle') {
    // DB read-only transaction; identity guards are rechecked inside it.
    console.log(JSON.stringify(await inspectQaLifecycle(sql, state), null, 2));
  } else if (action === 'inspect') {
    for (const [persona, u] of Object.entries(state.users)) {
      const user = await sql`SELECT id, role, onboarding_complete, name, phone FROM users WHERE clerk_id = ${u.clerkId}`;
      const artist = await sql`SELECT id, slug, name_ro, is_active, base_city, location, travel_distance_km, price_from FROM artists WHERE user_id = ${u.id}`;
      const venue = await sql`SELECT id, slug, name_ro, is_active, city FROM venues WHERE user_id = ${u.id}`;
      const contracts = await sql`SELECT id, subject_type, document_slug, signature_name, accepted_at, ip_address, device_summary, artist_id, venue_id FROM legal_acceptances WHERE user_id = ${u.id}`;
      console.log(JSON.stringify({ persona, user, artist, venue, contracts }));
    }
  } else {
    throw new Error('Use create, ticket <persona>, booking-contact client, safe-contact <persona>, signout <persona>, inspect, inspect-lifecycle, wizard-rollback, or simulate-completion-date');
  }
} finally { await sql.end(); }
