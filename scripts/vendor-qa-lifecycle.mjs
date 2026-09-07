/** Read-only lifecycle report for exact QA fixtures. No raw signature, IP,
 * identity document, contact value, booking message or secret is printed. */
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { readFileSync } from 'node:fs';
import { assertQaFixture, assertQaAppUser } from './vendor-qa-safety.mjs';

const required = ['acord-parteneri', 'termeni-generali', 'politica-confidentialitate', 'reguli-marketplace', 'tarife'];
const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');

export function summarizeQaAcceptance(row, profileIds, currentDocuments, packVersion) {
  const blocks = Array.isArray(row.document_blocks) ? row.document_blocks : [];
  const validBlocks = blocks.length > 0 && blocks.every(block => typeof block?.text === 'string');
  const computedHash = validBlocks ? createHash('sha256').update(blocks.map(block => block.text).join('\n')).digest('hex') : null;
  const png = typeof row.signature_image === 'string' && row.signature_image.startsWith('data:image/png;base64,')
    ? Buffer.from(row.signature_image.slice('data:image/png;base64,'.length), 'base64') : Buffer.alloc(0);
  const linked = row.subject_type === 'artist'
    ? profileIds.artist.includes(row.artist_id) && row.venue_id === null
    : row.subject_type === 'venue' && profileIds.venue.includes(row.venue_id) && row.artist_id === null;
  const normalize = value => typeof value === 'string' ? value.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase() : '';
  const expectedSigner = row.partner_type === 'individual' ? row.legal_name : row.representative_name;
  return {
    id: row.id, subjectType: row.subject_type, documentSlug: row.document_slug,
    documentVersion: row.document_version, packVersion: row.pack_version, locale: row.locale,
    acceptedAt: row.accepted_at, contentHash: row.content_hash, blockCount: blocks.length,
    hasValidAcceptedAt: row.accepted_at != null && Number.isFinite(new Date(row.accepted_at).getTime()),
    hashMatchesSnapshot: computedHash !== null && computedHash === row.content_hash,
    currentDocumentVersion: currentDocuments.some(doc => doc.slug === row.document_slug && doc.version === row.document_version),
    currentPackVersion: row.pack_version === packVersion,
    hasSignerName: Boolean(row.signature_name?.trim()),
    hasLegalIdentity: Boolean(row.legal_name?.trim() && row.id_number?.trim() && row.legal_address?.trim()),
    supportedIdentityType: ['individual', 'sole_trader', 'company'].includes(row.partner_type),
    supportedLocale: ['ro', 'ru', 'en'].includes(row.locale),
    signerMatchesIdentity: Boolean(normalize(expectedSigner)) && normalize(expectedSigner) === normalize(row.signature_name),
    signaturePngHeaderValid: png.length > 8 && png.subarray(0, 8).equals(pngHeader), signatureBytes: png.length,
    hasIpAddress: Boolean(row.ip_address?.trim()), ipAddressValid: isIP(row.ip_address ?? '') !== 0,
    hasUserAgent: Boolean(row.user_agent?.trim()), hasDeviceSummary: Boolean(row.device_summary?.trim()),
    profileLinkValid: linked, artistId: row.artist_id, venueId: row.venue_id,
    copyPath: `/api/legal/accept/${row.id}/copy`,
  };
}

export function summarizeQaPack(rows, persona, profileIds, currentDocuments, packVersion) {
  const evidence = rows.map(row => summarizeQaAcceptance(row, profileIds, currentDocuments, packVersion));
  const needed = persona === 'venue' ? [...required, 'acord-locatii'] : persona === 'artist' ? required : [];
  // A complete pack must belong to one signing session and identity, not a
  // union of documents accepted separately by different representatives.
  const sessions = new Map();
  for (const [index, row] of rows.entries()) {
    const summary = evidence[index];
    if (row.subject_type !== persona || !summary.hasValidAcceptedAt) continue;
    const key = JSON.stringify([new Date(row.accepted_at).toISOString(), row.locale, row.signature_name,
      row.signature_image, row.partner_type, row.legal_name, row.id_number, row.legal_address,
      row.representative_name, row.representative_role]);
    const session = sessions.get(key) ?? [];
    session.push(summary);
    sessions.set(key, session);
  }
  const documentComplete = row => row.currentDocumentVersion && row.currentPackVersion &&
    row.hashMatchesSnapshot && row.hasSignerName && row.hasLegalIdentity && row.signaturePngHeaderValid &&
    row.supportedIdentityType && row.supportedLocale && row.signerMatchesIdentity &&
    row.ipAddressValid && row.hasUserAgent && row.hasDeviceSummary && row.profileLinkValid;
  const completeCurrentPack = needed.length ? [...sessions.values()].some(session =>
    needed.every(slug => session.some(row => row.documentSlug === slug && documentComplete(row)))) : rows.length === 0;
  return {
    count: rows.length, expectedRequiredCount: needed.length, completeCurrentPack,
    signatureCheck: 'PNG header only; inspect the signed copy to verify the visible handwriting.',
    evidence,
  };
}

export async function inspectQaLifecycle(sql, state) {
  const fixtures = Object.fromEntries(['artist', 'venue', 'client', 'admin'].map(persona => [persona, assertQaFixture(state, persona)]));
  const documents = JSON.parse(readFileSync(new URL('../src/content/legal/documents.json', import.meta.url), 'utf8'));
  const legalSource = readFileSync(new URL('../src/lib/legal/index.ts', import.meta.url), 'utf8');
  const packVersion = legalSource.match(/export const LEGAL_PACK_VERSION = "([^"]+)"/)?.[1];
  if (!packVersion) throw new Error('Cannot resolve current legal pack for QA inspection');
  return sql.begin('read only', async tx => {
    const users = {};
    for (const [persona, fixture] of Object.entries(fixtures)) {
      const rows = await tx`SELECT id, clerk_id, email, role, onboarding_complete, phone = 'QA TEST' AS safe_contact
        FROM users WHERE id = ${fixture.id} AND clerk_id = ${fixture.clerkId} AND email = ${fixture.email}`;
      const row = assertQaAppUser(rows, fixture);
      users[persona] = { id: row.id, role: row.role, onboardingComplete: row.onboarding_complete, safeContact: row.safe_contact };
    }
    const artists = await tx`SELECT a.id, a.slug, a.name_ro, a.is_active, a.base_city, a.location,
        a.travel_distance_km, a.travel_surcharge_enabled, a.travel_surcharge_amount,
        a.price_from, a.price_hidden, a.rating_avg, a.rating_count,
        a.photo_url IS NOT NULL AS has_photo,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name_ro, 'slug', c.slug, 'active', c.is_active))
          FROM categories c WHERE c.id = ANY(a.category_ids)), '[]'::jsonb) AS categories
      FROM artists a WHERE a.user_id = ${fixtures.artist.id}`;
    const venues = await tx`SELECT v.id, v.slug, v.name_ro, v.is_active, v.city, v.capacity_min, v.capacity_max,
        v.rating_avg, v.rating_count,
        (SELECT count(*)::int FROM venue_images i WHERE i.venue_id = v.id) AS image_count
      FROM venues v WHERE v.user_id = ${fixtures.venue.id}`;
    const profileIds = { artist: artists.map(row => row.id), venue: venues.map(row => row.id) };
    const legal = {};
    for (const [persona, fixture] of Object.entries(fixtures)) {
      const rows = await tx`SELECT id, subject_type, document_slug, document_version, pack_version, locale,
        signature_name, signature_image, partner_type, legal_name, id_number, legal_address,
        representative_name, representative_role, accepted_at,
        ip_address, user_agent, device_summary, content_hash, document_blocks, artist_id, venue_id
        FROM legal_acceptances WHERE user_id = ${fixture.id} ORDER BY accepted_at, id`;
      legal[persona] = summarizeQaPack(rows, persona, profileIds, documents, packVersion);
    }
    const bookings = await tx`SELECT b.id, b.artist_id, b.venue_id, b.event_plan_id, b.event_date,
        b.event_type, b.guest_count, b.start_time, b.end_time, b.status, b.source,
        b.agreed_price, b.paid_status, b.price_offers, b.client_confirmed_at, b.confirmed_at,
        b.client_signed_at, b.client_signature IS NOT NULL AS has_client_signature,
        b.contract_pdf_url IS NOT NULL AS has_contract_pdf,
        b.client_phone = 'QA TEST' AS safe_booking_contact,
        b.client_email = ${fixtures.client.email} AS fixture_email_matches,
        (b.confirmed_at AT TIME ZONE 'Europe/Chisinau')::date + 30 AS expected_due_date,
        b.event_date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS event_in_past,
        b.event_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Chisinau')::date AS event_in_past_local
      FROM booking_requests b
      LEFT JOIN artists a ON a.id = b.artist_id LEFT JOIN venues v ON v.id = b.venue_id
      WHERE b.client_user_id = ${fixtures.client.id} AND
        ((a.user_id = ${fixtures.artist.id} AND b.venue_id IS NULL) OR
         (v.user_id = ${fixtures.venue.id} AND b.artist_id IS NULL)) ORDER BY b.id`;
    const [outOfScope] = await tx`SELECT count(*)::int AS count FROM booking_requests b
      LEFT JOIN artists a ON a.id = b.artist_id LEFT JOIN venues v ON v.id = b.venue_id
      WHERE (b.client_user_id = ${fixtures.client.id} OR a.user_id = ${fixtures.artist.id} OR v.user_id = ${fixtures.venue.id})
      AND (b.client_user_id = ${fixtures.client.id} AND
        ((a.user_id = ${fixtures.artist.id} AND b.venue_id IS NULL) OR (v.user_id = ${fixtures.venue.id} AND b.artist_id IS NULL))) IS NOT TRUE`;
    const bookingIds = bookings.map(row => row.id);
    const commissions = bookingIds.length ? await tx`SELECT id, booking_request_id, vendor_type, artist_id, venue_id,
      base_amount, currency, rate_bps, amount, guest_count, tier, status, due_date
      FROM commissions WHERE booking_request_id IN ${tx(bookingIds)} ORDER BY id` : [];
    const reviews = bookingIds.length ? await tx`SELECT id, booking_request_id, artist_id, venue_id, rating, is_approved,
      author_user_id = ${fixtures.client.id} AS fixture_author_matches,
      char_length(COALESCE(text, '')) AS text_length, reply IS NOT NULL AS has_reply, reply_at, created_at
      FROM reviews WHERE booking_request_id IN ${tx(bookingIds)} ORDER BY id` : [];
    return {
      marker: state.marker, inspectedAt: new Date().toISOString(), readOnly: true,
      users, artists, venues, legal, outOfScopeRelatedBookingCount: outOfScope.count,
      bookings: bookings.map(({ price_offers, ...row }) => {
        const fees = commissions.filter(fee => fee.booking_request_id === row.id);
        const feedback = reviews.filter(review => review.booking_request_id === row.id);
        return { ...row, priceOffers: Array.isArray(price_offers) ? price_offers.map(offer => ({ from: offer.from, amount: offer.amount, at: offer.at, hasMessage: Boolean(offer.message) })) : [],
          commissionCount: fees.length, commissions: fees.map(fee => ({ ...fee, dueDateMatches30Days: String(fee.due_date) === String(row.expected_due_date) })),
          reviews: feedback, canReviewByDateAndStatus: ['confirmed_by_client', 'completed'].includes(row.status) && row.event_in_past && !feedback.length };
      }),
    };
  });
}
