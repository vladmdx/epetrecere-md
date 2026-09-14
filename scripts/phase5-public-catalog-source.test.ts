import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const venuesQuery = readFileSync("src/lib/db/queries/venues.ts", "utf8");
const catalogQuery = readFileSync("src/lib/venues/catalog-query.ts", "utf8");
const publication = readFileSync("src/lib/venues/public-publication.ts", "utf8");
const effectivePrice = readFileSync("src/lib/venues/effective-price.ts", "utf8");
const bulk = readFileSync("src/lib/booking/venue-availability-bulk.ts", "utf8");
const bookingWrite = readFileSync("src/lib/booking/venue-booking-write.ts", "utf8");
const jsonld = readFileSync("src/lib/seo/jsonld.ts", "utf8");
const gated = readFileSync("src/app/api/public/gated-details/route.ts", "utf8");
const bookingClient = readFileSync("src/lib/booking/booking-create-client.ts", "utf8");
const venueMenuRoute = readFileSync("src/app/api/venue-menu/route.ts", "utf8");
const venueImagesRoute = readFileSync("src/app/api/venue-images/route.ts", "utf8");
const venueDetailRoute = readFileSync("src/app/api/venues/[id]/route.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

test("flag OFF getVenues does not query halls or organizations", () => {
  const start = venuesQuery.indexOf("export async function getVenues");
  const end = venuesQuery.indexOf("export async function getVenueBySlug", start);
  assert.ok(start >= 0 && end > start);
  const fn = venuesQuery.slice(start, end);
  const offStart = fn.indexOf("const page");
  const off = fn.slice(offStart);
  assert.doesNotMatch(off, /venueHalls|partnerOrganizations|venue_halls|partner_organizations/);
  assert.match(fn, /if \(isMultiHallEnabled\(\)\) \{\s*return getVenuesMultiHall/);
});

test("flag ON publication requires active venue, org if present, and an active hall", () => {
  assert.match(publication, /FEATURE_MULTI_HALL|isMultiHallEnabled/);
  assert.match(publication, /partner_organizations po/);
  assert.match(publication, /po.status = 'active'/);
  assert.match(publication, /venue_halls vh/);
  assert.match(publication, /vh.status = 'active'/);
  assert.match(catalogQuery, /publishedVenuePredicateSql\(\)/);
  assert.match(catalogQuery, /cards\.slice\(offset, offset \+ parsed\.limit\)/);
  assert.match(catalogQuery, /a\.id - b\.id/);
});

test("price resolver never writes commercial booking fields", () => {
  const code = effectivePrice.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /agreedPrice|commercialSnapshot/);
  assert.match(effectivePrice, /Display, filter, sort and hall selection only/);
});

test("bulk availability is read-only and reuses occupancy predicates", () => {
  assert.doesNotMatch(bulk, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(bulk, /intervalsOverlapHalfOpen/);
  assert.match(bulk, /Does not acquire locks or write/);
  assert.match(catalogQuery, /withAdjacentIsoDates\(localDatesIntersecting\(interval\)\)/);
});

test("public booking still requires hallId when the flag is on", () => {
  assert.match(bookingWrite, /code: "HALL_REQUIRED"/);
  assert.match(bookingWrite, /if \(input\.hallId == null\)/);
});

test("JSON-LD has no anonymous price and halls are fragment containsPlace", () => {
  const start = jsonld.indexOf("export function venueJsonLd");
  const body = jsonld.slice(start, jsonld.indexOf("export function itemListJsonLd", start));
  assert.doesNotMatch(body, /price|offers/i);
  assert.match(body, /containsPlace/);
  assert.match(body, /#hall-\$\{hall\.slug\}/);
});

test("gated-details stays private no-store, allowlisted, and uses existing rateLimit", () => {
  assert.match(gated, /rateLimit\(`gated-details:/);
  assert.match(gated, /Cache-Control": "private, no-store"/);
  assert.match(gated, /if \(!isMultiHallEnabled\(\)\)/);
  assert.doesNotMatch(gated, /agreedPrice|commercialSnapshot|phone|email/);
});

test("venue-menu GET enforces publication, hall-scoped menus, redaction, and private caching", () => {
  const get = sourceBetween(venueMenuRoute, "export async function GET", "// Action-based POST");

  assert.match(get, /publishedVenuePredicateSql\(\)/);
  assert.match(get, /getVenueMenuForHall\(venueId, selectedHallId\)/);
  assert.match(get, /publicCatalogData\(menu, Boolean\(userId\)\)/);
  assert.match(get, /Cache-Control": "private, no-store"/);
  assert.ok(
    get.indexOf("publishedVenuePredicateSql()") < get.indexOf("getVenueMenuForHall(venueId, selectedHallId)"),
    "publication must be proved before the hall menu is loaded",
  );
});

test("venue-images GET uses the complete shared publication predicate", () => {
  const get = sourceBetween(venueImagesRoute, "export async function GET", "// POST /api/venue-images");

  assert.match(get, /\.where\(and\(eq\(venues\.id, venueId\), publishedVenuePredicateSql\(\)\)\)/);
  assert.match(get, /canViewPrivate \? undefined : publishedVenuePredicateSql\(\)/);
  assert.doesNotMatch(get, /canViewPrivate \? undefined : eq\(venues\.isActive, true\)/);
});

test("public venue detail API crosses the explicit allowlist boundary", () => {
  const get = sourceBetween(venueDetailRoute, "export async function GET", "// M12 / ADR 0028");
  const publicBranch = sourceBetween(get, "if (!privileged)", "const [images, venueReviews]");

  assert.match(publicBranch, /publishedVenuePredicateSql\(\)/);
  assert.match(publicBranch, /allowlistedVenueDetail\(publicVenue\)/);
  assert.match(publicBranch, /revealLegacyPrice = Boolean\(userId\) && !isMultiHallEnabled\(\)/);
  assert.match(publicBranch, /revealPrices: revealLegacyPrice/);
  assert.match(publicBranch, /publicCatalogData\(allowlistedVenueDetail\(publicVenue\), revealLegacyPrice\)/);
  assert.match(publicBranch, /Cache-Control": "private, no-store"/);
});

test("gated venue details require one selected active hall and do not enumerate halls", () => {
  const hallSelection = sourceBetween(gated, "const requestedHallSlug", "const hallPrices");
  const venueResponse = sourceBetween(gated, "const hallPrices", "headers: { \"Cache-Control\": \"private, no-store\" }");

  assert.match(hallSelection, /searchParams\.get\("hall"\)/);
  assert.match(hallSelection, /if \(!requestedHallSlug\)/);
  assert.match(hallSelection, /error: "hall_required"/);
  assert.match(hallSelection, /const halls = await db/);
  assert.match(hallSelection, /eq\(venueHalls\.status, "active"\)/);
  assert.match(hallSelection, /eq\(venueHalls\.slug, requestedHallSlug\)/);
  assert.match(hallSelection, /\.limit\(1\)/);
  assert.match(hallSelection, /if \(!halls\.length\)/);
  assert.match(venueResponse, /getVenueMenuForHall\(row\.id, halls\[0\]\.id\)/);
  assert.doesNotMatch(hallSelection, /\.orderBy\(/);
});

test("catalog reviews use an explicit public projection without booking linkage", () => {
  const reviewField = catalogQuery.indexOf("id: reviews.id");
  assert.ok(reviewField >= 0, "catalog review projection is missing");
  const selectStart = catalogQuery.lastIndexOf(".select({", reviewField);
  const fromReviews = catalogQuery.indexOf(".from(reviews)", reviewField);
  assert.ok(selectStart >= 0 && fromReviews > reviewField, "catalog review select is not explicit");
  const reviewProjection = catalogQuery.slice(selectStart, fromReviews);

  for (const field of ["id", "authorName", "rating", "text", "reply", "isApproved", "photos", "createdAt"]) {
    assert.match(reviewProjection, new RegExp(`${field}: reviews\\.${field}`));
  }
  assert.doesNotMatch(reviewProjection, /bookingRequestId|venueId|hallId|eventDate/);
});

test("browser client conflicts Hall A to Hall B on the same pending key", () => {
  assert.match(bookingClient, /BookingCreateHallConflictError/);
  assert.match(bookingClient, /existingHallId !== nextHallId/);
});
