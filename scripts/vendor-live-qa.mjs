/** Isolated identities for the manual vendor lifecycle QA, never real users. */
import { config } from 'dotenv';
import { createClerkClient } from '@clerk/backend';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

config({ path: '.env.production.local', quiet: true });
const statePath = '/tmp/epetrecere-vendor-qa-20260906.json';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false, max: 1 });
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const action = process.argv[2] || 'inspect';
let state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { marker: randomUUID(), users: {} };
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });

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
  } else if (action === 'inspect') {
    for (const [persona, u] of Object.entries(state.users)) {
      const user = await sql`SELECT id, role, onboarding_complete, name, phone FROM users WHERE clerk_id = ${u.clerkId}`;
      const artist = await sql`SELECT id, slug, name_ro, is_active, base_city, location, travel_distance_km, price_from FROM artists WHERE user_id = ${u.id}`;
      const venue = await sql`SELECT id, slug, name_ro, is_active, city FROM venues WHERE user_id = ${u.id}`;
      const contracts = await sql`SELECT id, subject_type, document_slug, signature_name, accepted_at, ip_address, device_summary, artist_id, venue_id FROM legal_acceptances WHERE user_id = ${u.id}`;
      console.log(JSON.stringify({ persona, user, artist, venue, contracts }));
    }
  } else {
    throw new Error('Use create, ticket <persona>, or inspect');
  }
} finally { await sql.end(); }
