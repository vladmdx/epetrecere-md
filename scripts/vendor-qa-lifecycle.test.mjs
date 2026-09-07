import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inspectQaLifecycle, summarizeQaAcceptance, summarizeQaPack } from './vendor-qa-lifecycle.mjs';

const blocks = [{ type: 'p', text: 'Synthetic immutable agreement.' }, { type: 'p', text: 'Synthetic identity only.' }];
const row = {
  id: 99, subject_type: 'artist', document_slug: 'acord-parteneri', document_version: '2.1', pack_version: '2.1', locale: 'ro',
  signature_name: 'QA SIGNER SECRET VALUE', legal_name: 'QA SIGNER SECRET VALUE', id_number: 'QA-ID-PRIVATE', legal_address: 'QA ADDRESS',
  partner_type: 'individual', representative_name: null, representative_role: null,
  signature_image: 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64'),
  document_blocks: blocks, content_hash: createHash('sha256').update(blocks.map(block => block.text).join('\n')).digest('hex'),
  artist_id: 1, venue_id: null, ip_address: '203.0.113.42', user_agent: 'QA raw user agent', device_summary: 'QA device', accepted_at: '2026-09-07T10:00:00Z',
};
const profiles = { artist: [1], venue: [2] };
const docs = [{ slug: 'acord-partneri', version: '2.1' }, { slug: 'acord-parteneri', version: '2.1' }];
const summary = candidate => summarizeQaAcceptance(candidate, profiles, docs, '2.1');

test('summarized evidence verifies hash/current version/identity and exact profile link', () => {
  const result = summary(row);
  for (const key of ['hashMatchesSnapshot', 'currentDocumentVersion', 'currentPackVersion', 'hasValidAcceptedAt', 'hasSignerName', 'hasLegalIdentity', 'supportedIdentityType', 'supportedLocale', 'signerMatchesIdentity', 'signaturePngHeaderValid', 'hasIpAddress', 'ipAddressValid', 'hasUserAgent', 'hasDeviceSummary', 'profileLinkValid']) assert.equal(result[key], true, key);
  assert.equal(result.contentHash, row.content_hash);
  assert.equal(result.copyPath, '/api/legal/accept/99/copy');
});

test('private identity, IP, raw agent, signature bytes and document text never leak to report', () => {
  const output = JSON.stringify(summary(row));
  for (const privateValue of [row.signature_name, row.legal_name, row.id_number, row.legal_address, row.ip_address, row.user_agent, row.signature_image, blocks[0].text]) assert.ok(!output.includes(privateValue));
});

test('drift, stale versions, missing technical evidence and wrong profiles are reported', () => {
  assert.equal(summary({ ...row, content_hash: 'wrong' }).hashMatchesSnapshot, false);
  assert.equal(summary({ ...row, document_blocks: [] }).hashMatchesSnapshot, false);
  assert.equal(summary({ ...row, document_version: '1.0' }).currentDocumentVersion, false);
  assert.equal(summary({ ...row, pack_version: '1.0' }).currentPackVersion, false);
  assert.equal(summary({ ...row, artist_id: 3 }).profileLinkValid, false);
  assert.equal(summary({ ...row, venue_id: 2 }).profileLinkValid, false);
  assert.equal(summary({ ...row, ip_address: '' }).hasIpAddress, false);
  assert.equal(summary({ ...row, signature_image: null }).signaturePngHeaderValid, false);
  assert.equal(summary({ ...row, accepted_at: null }).hasValidAcceptedAt, false);
  assert.equal(summary({ ...row, accepted_at: 'not a date' }).hasValidAcceptedAt, false);
});

const requiredSlugs = ['acord-parteneri', 'termeni-generali', 'politica-confidentialitate', 'reguli-marketplace', 'tarife'];
const packRows = requiredSlugs.map((slug, index) => ({ ...row, id: index + 1, document_slug: slug }));
const packDocs = [...requiredSlugs, 'acord-locatii'].map(slug => ({ slug, version: '2.1' }));
const pack = rows => summarizeQaPack(rows, 'artist', profiles, packDocs, '2.1');

test('complete packs require current evidence from one signing session', () => {
  assert.equal(pack(packRows).completeCurrentPack, true);
  assert.equal(pack(packRows.slice(0, -1)).completeCurrentPack, false);
  for (const changes of [
    { accepted_at: '2026-09-07T10:01:00Z' }, { locale: 'ru' }, { signature_name: 'Another QA Signer' },
    { legal_name: 'Another QA Entity' }, { representative_name: 'Different Representative' },
    { signature_image: row.signature_image + 'AAAA' },
  ]) {
    const mixed = packRows.map((item, index) => index === 0 ? { ...item, ...changes } : item);
    assert.equal(pack(mixed).completeCurrentPack, false, JSON.stringify(changes));
  }
});

test('missing identity or technical evidence cannot produce a complete-pack success', () => {
  for (const changes of [{ signature_name: '' }, { legal_address: '' }, { ip_address: '' },
    { ip_address: 'unknown' }, { user_agent: '' }, { device_summary: '' }, { accepted_at: null },
    { locale: 'invalid' }, { partner_type: 'invalid' }, { legal_name: 'Wrong signer' },
    { partner_type: 'company', representative_name: null }]) {
    assert.equal(pack(packRows.map(item => ({ ...item, ...changes }))).completeCurrentPack, false);
  }
  const venueRows = [...packRows, { ...row, id: 6, document_slug: 'acord-locatii' }]
    .map(item => ({ ...item, subject_type: 'venue', artist_id: null, venue_id: 2 }));
  assert.equal(summarizeQaPack(venueRows, 'venue', profiles, packDocs, '2.1').completeCurrentPack, true);
  assert.equal(summarizeQaPack(venueRows.slice(0, -1), 'venue', profiles, packDocs, '2.1').completeCurrentPack, false);
});

const marker = '10000000-0000-4000-8000-000000000001';
const state = { marker, users: Object.fromEntries(['artist', 'venue', 'client', 'admin'].map((persona, index) => [persona, {
  id: `10000000-0000-4000-8000-00000000000${index + 2}`, clerkId: `user_QA${persona}`,
  email: `qa-${persona}-${marker}@invalid.epetrecere.md`,
}])) };

test('inspection fails before queries for a missing fixture and inside the transaction for an identity mismatch', async () => {
  let began = false;
  await assert.rejects(() => inspectQaLifecycle({ begin() { began = true; } }, { marker, users: {} }), /invalid isolated QA identity/);
  assert.equal(began, false);
  let queries = 0;
  const sql = { async begin(mode, inspect) {
    assert.equal(mode, 'read only');
    return inspect(async () => { queries++; return []; });
  } };
  await assert.rejects(() => inspectQaLifecycle(sql, state), /app identity does not exactly match/);
  assert.equal(queries, 1);
});

test('entire empty-fixture inspection is read-only, scoped and redacts fixture contact values', async () => {
  const queries = [];
  const sql = { async begin(mode, inspect) {
    assert.equal(mode, 'read only');
    return inspect(async (strings, ...values) => {
      const query = strings.join('?');
      queries.push({ query, values });
      if (query.includes('FROM users')) {
        const fixture = Object.values(state.users).find(user => user.id === values[0]);
        assert.ok(fixture);
        assert.deepEqual(values, [fixture.id, fixture.clerkId, fixture.email]);
        return [{ id: fixture.id, clerk_id: fixture.clerkId, email: fixture.email, role: 'user', onboarding_complete: false, safe_contact: true }];
      }
      if (query.includes('AS count FROM booking_requests')) return [{ count: 0 }];
      return [];
    });
  } };
  const report = await inspectQaLifecycle(sql, state);
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.bookings, []);
  assert.equal(report.legal.artist.completeCurrentPack, false);
  assert.equal(report.legal.venue.completeCurrentPack, false);
  for (const persona of ['artist', 'venue', 'client', 'admin']) {
    assert.ok(queries.some(({ query, values }) => query.includes('FROM legal_acceptances') && values.length === 1 && values[0] === state.users[persona].id));
    assert.ok(!JSON.stringify(report).includes(state.users[persona].email));
  }
  for (const { query } of queries) assert.match(query.trim(), /^SELECT\b/);
  const bookingQuery = queries.find(({ query }) => query.includes('b.price_offers'));
  assert.ok(bookingQuery.values.includes(state.users.artist.id));
  assert.ok(bookingQuery.values.includes(state.users.venue.id));
  assert.ok(bookingQuery.values.includes(state.users.client.id));
  assert.match(bookingQuery.query, /AT TIME ZONE 'UTC'\)::date AS event_in_past/);
});

test('query helper contains only SELECTs inside a database-enforced read-only transaction', () => {
  const source = readFileSync(new URL('./vendor-qa-lifecycle.mjs', import.meta.url), 'utf8');
  assert.match(source, /sql\.begin\('read only'/);
  assert.doesNotMatch(source, /\b(?:UPDATE|DELETE|INSERT|TRUNCATE|ALTER|DROP)\b/);
  assert.match(source, /assertQaAppUser\(rows, fixture\)/);
  assert.match(source, /b\.client_user_id = \$\{fixtures\.client\.id\}/);
  assert.match(source, /a\.user_id = \$\{fixtures\.artist\.id\}/);
  assert.match(source, /v\.user_id = \$\{fixtures\.venue\.id\}/);
});
