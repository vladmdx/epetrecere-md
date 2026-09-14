import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const writes = readFileSync("src/lib/partner/venue-image-writes.ts", "utf8");
const collectionRoute = readFileSync("src/app/api/venue-images/route.ts", "utf8");
const itemRoute = readFileSync("src/app/api/venue-images/[id]/route.ts", "utf8");
const access = readFileSync("src/lib/venue-access.ts", "utf8");
const venueQueries = readFileSync("src/lib/db/queries/venues.ts", "utf8");
const venueOgRoute = readFileSync(
  "src/app/[locale]/(public)/sali/[slug]/opengraph-image.tsx",
  "utf8",
);
const meVenueRoute = readFileSync("src/app/api/me/venue/route.ts", "utf8");
const publicVenueRoute = readFileSync("src/app/api/venues/[id]/route.ts", "utf8");
const comparePage = readFileSync(
  "src/app/[locale]/(public)/sali/compare/page.tsx",
  "utf8",
);
const wishlistRoute = readFileSync("src/app/api/wishlist/route.ts", "utf8");

test("venue image routes delegate every mutation with an authenticated actor id", () => {
  assert.match(collectionRoute, /hallId:\s*z\.null\(\)\.optional\(\)/);
  assert.match(collectionRoute, /createVenueImage\(actor\.id/);
  assert.match(collectionRoute, /reorderVenueImages\(actor\.id/);
  assert.match(collectionRoute, /deleteVenueImage\(actor\.id/);
  assert.doesNotMatch(collectionRoute, /\.insert\(venueImages\)/);
  assert.doesNotMatch(collectionRoute, /\.update\(venueImages\)/);
  assert.doesNotMatch(collectionRoute, /\.delete\(venueImages\)/);

  assert.match(itemRoute, /updateVenueImage\(actor\.id/);
  assert.match(itemRoute, /deleteVenueImage\(actor\.id/);
  assert.match(itemRoute, /\.refine\(\(patch\) => Object\.keys\(patch\)\.length > 0/);
  assert.doesNotMatch(itemRoute, /from "@\/lib\/db"/);
});

test("venue-level reads exclude hall-scoped images", () => {
  assert.match(
    collectionRoute,
    /eq\(venueImages\.venueId, venueId\)[\s\S]*isNull\(venueImages\.hallId\)/,
  );
  const publicScopeFilters = venueQueries.match(/isNull\(venueImages\.hallId\)/g) ?? [];
  assert.ok(
    publicScopeFilters.length >= 3,
    "listing covers, venue detail gallery and featured covers must be general images",
  );
  assert.match(
    meVenueRoute,
    /isNull\(venueImages\.hallId\)[\s\S]*\.orderBy\([\s\S]*desc\(venueImages\.isCover\)[\s\S]*asc\(venueImages\.sortOrder\)[\s\S]*asc\(venueImages\.id\)/,
  );
  assert.match(
    publicVenueRoute,
    /eq\(venueImages\.venueId, venueId\)[\s\S]*isNull\(venueImages\.hallId\)/,
  );
  assert.match(
    publicVenueRoute,
    /\.from\(venueImages\)[\s\S]*\.innerJoin\(venues, eq\(venues\.id, venueImages\.venueId\)\)[\s\S]*privileged \? undefined : eq\(venues\.isActive, true\)/,
  );
  assert.equal(
    (venueQueries.match(/\.innerJoin\(venues, eq\(venues\.id, venueImages\.venueId\)\)/g) ?? []).length,
    3,
  );
  assert.ok((venueQueries.match(/eq\(venues\.isActive, true\)/g) ?? []).length >= 6);
  assert.match(
    comparePage,
    /inArray\(venueImages\.venueId, ids\)[\s\S]*isNull\(venueImages\.hallId\)/,
  );
  assert.match(
    comparePage,
    /\.from\(venues\)[\s\S]*inArray\(venues\.id, ids\)[\s\S]*eq\(venues\.isActive, true\)/,
  );
  assert.match(
    comparePage,
    /\.from\(venueImages\)[\s\S]*\.innerJoin\(venues, eq\(venues\.id, venueImages\.venueId\)\)[\s\S]*eq\(venues\.isActive, true\)/,
  );
});

test("venue Open Graph data follows the public publication boundary", () => {
  const queryStart = venueQueries.indexOf(
    "export async function getPublicVenueOgBySlug",
  );
  const queryEnd = venueQueries.indexOf(
    "export async function getVenues",
    queryStart,
  );
  assert.ok(queryStart >= 0 && queryEnd > queryStart);
  const query = venueQueries.slice(queryStart, queryEnd);

  assert.match(query, /if \(!isMultiHallEnabled\(\)\)/);
  assert.match(
    query,
    /eq\(venues\.slug, slug\)[\s\S]*eq\(venues\.isActive, true\)/,
  );
  assert.match(
    query,
    /\.innerJoin\([\s\S]*venueHalls[\s\S]*eq\(venueHalls\.venueId, venues\.id\)[\s\S]*eq\(venueHalls\.status, "active"\)/,
  );
  assert.match(
    query,
    /\.leftJoin\([\s\S]*partnerOrganizations[\s\S]*eq\(partnerOrganizations\.id, venues\.organizationId\)/,
  );
  assert.match(
    query,
    /or\([\s\S]*isNull\(venues\.organizationId\)[\s\S]*eq\(partnerOrganizations\.status, "active"\)/,
  );
  assert.doesNotMatch(query, /pricePerPerson|phone|email|bankDetails/);

  assert.match(venueOgRoute, /export const revalidate = 0/);
  assert.match(venueOgRoute, /getPublicVenueOgBySlug\(slug\)/);
  assert.match(venueOgRoute, /if \(!venue\) notFound\(\)/);
  assert.doesNotMatch(venueOgRoute, /\.from\(venues\)/);
  assert.doesNotMatch(venueOgRoute, /pricePerPerson/);
  assert.doesNotMatch(venueOgRoute, /DB not available/);
});

test("the public gallery never exposes inactive venue images to anonymous callers", () => {
  const route = readFileSync("src/app/api/venue-images/route.ts", "utf8");
  const getStart = route.indexOf("export async function GET");
  const getEnd = route.indexOf("// POST", getStart);
  assert.ok(getStart >= 0 && getEnd > getStart);
  const getBody = route.slice(getStart, getEnd);

  assert.match(getBody, /\.select\(\{ isActive: venues\.isActive \}\)/);
  assert.match(
    getBody,
    /if \(!venue\.isActive\)[\s\S]*getCurrentAppUser\(\)[\s\S]*authorizeVenueCapability\(actor, venueId, "view_private"\)/,
  );
  assert.match(
    getBody,
    /\.from\(venueImages\)[\s\S]*\.innerJoin\(venues, eq\(venues\.id, venueImages\.venueId\)\)[\s\S]*canViewInactive \? undefined : eq\(venues\.isActive, true\)/,
  );
});

test("wishlist reads and writes enforce public entity and category visibility", () => {
  const getStart = wishlistRoute.indexOf("export async function GET");
  const getEnd = wishlistRoute.indexOf("// ─── POST", getStart);
  assert.ok(getStart >= 0 && getEnd > getStart);
  const wishlistGet = wishlistRoute.slice(getStart, getEnd);

  const artistReadStart = wishlistGet.indexOf("artistIds.length");
  const venueReadStart = wishlistGet.indexOf("venueIds.length", artistReadStart);
  const coverReadStart = wishlistGet.indexOf("venueIds.length", venueReadStart + 1);
  const categoryReadStart = wishlistGet.indexOf(
    ".select({ id: categories.id",
    coverReadStart,
  );
  const batchEnd = wishlistGet.indexOf("]);", categoryReadStart);
  assert.ok(
    artistReadStart >= 0 &&
      venueReadStart > artistReadStart &&
      coverReadStart > venueReadStart &&
      categoryReadStart > coverReadStart &&
      batchEnd > categoryReadStart,
    "wishlist GET batch queries must remain independently identifiable",
  );

  const artistRead = wishlistGet.slice(artistReadStart, venueReadStart);
  const venueRead = wishlistGet.slice(venueReadStart, coverReadStart);
  const coverRead = wishlistGet.slice(coverReadStart, categoryReadStart);
  const categoryRead = wishlistGet.slice(categoryReadStart, batchEnd);
  assert.match(
    artistRead,
    /\.from\(artists\)[\s\S]*inArray\(artists\.id, artistIds\)[\s\S]*eq\(artists\.isActive, true\)/,
  );
  assert.match(
    venueRead,
    /\.from\(venues\)[\s\S]*inArray\(venues\.id, venueIds\)[\s\S]*eq\(venues\.isActive, true\)/,
  );
  assert.match(
    coverRead,
    /\.from\(venueImages\)[\s\S]*\.innerJoin\(venues, eq\(venues\.id, venueImages\.venueId\)\)[\s\S]*eq\(venues\.isActive, true\)/,
  );
  assert.match(categoryRead, /\.from\(categories\)/);
  assert.match(
    categoryRead,
    /\.where\(eq\(categories\.isActive, true\)\)/,
  );

  const postStart = wishlistRoute.indexOf("export async function POST");
  const postEnd = wishlistRoute.indexOf("// ─── DELETE", postStart);
  assert.ok(postStart >= 0 && postEnd > postStart);
  const postBody = wishlistRoute.slice(postStart, postEnd);
  const artistBranchStart = postBody.indexOf(
    'if (parsed.data.entityType === "artist")',
  );
  const venueBranchStart = postBody.indexOf("} else {", artistBranchStart);
  const insertStart = postBody.indexOf(
    "// onConflictDoNothing",
    venueBranchStart,
  );
  assert.ok(
    artistBranchStart >= 0 &&
      venueBranchStart > artistBranchStart &&
      insertStart > venueBranchStart,
    "wishlist POST entity branches must remain independently identifiable",
  );
  const artistBranch = postBody.slice(artistBranchStart, venueBranchStart);
  const venueBranch = postBody.slice(venueBranchStart, insertStart);
  assert.match(
    artistBranch,
    /\.from\(artists\)[\s\S]*eq\(artists\.id, parsed\.data\.entityId\)[\s\S]*eq\(artists\.isActive, true\)/,
  );
  assert.match(
    venueBranch,
    /\.from\(venues\)[\s\S]*eq\(venues\.id, parsed\.data\.entityId\)[\s\S]*eq\(venues\.isActive, true\)/,
  );
  assert.match(
    wishlistRoute,
    /entityType:\s*z\.enum\(\["artist", "venue"\]\)/,
  );
});

test("transactional authority follows the shared lock order", () => {
  const start = writes.indexOf("async function lockAuthorizedVenue");
  const end = writes.indexOf("function hallImageMutationFailure", start);
  assert.ok(start >= 0 && end > start);
  const body = writes.slice(start, end);
  const userOrgAdvisory = body.indexOf("acquireLegalScopeLocks");
  const availability = body.indexOf("acquireAvailabilityLocks");
  const actorRow = body.indexOf("getLockedAppUserById");
  const venueRow = body.indexOf(".from(venues)");
  const lockedCapability = body.indexOf("authorizeVenueCapabilityLocked");
  assert.ok(userOrgAdvisory >= 0);
  assert.ok(availability > userOrgAdvisory);
  assert.ok(actorRow > availability);
  assert.ok(venueRow > actorRow);
  assert.ok(lockedCapability > venueRow);
  assert.match(body, /VENUE_SCOPE_CHANGED/);
  const lockedStart = access.indexOf("export async function authorizeVenueCapabilityLocked");
  const lockedEnd = access.indexOf("export async function authorizeOrganizationCapability", lockedStart);
  assert.ok(lockedStart >= 0 && lockedEnd > lockedStart);
  assert.match(access.slice(lockedStart, lockedEnd), /authorizeVenueAccess\([\s\S]*true/);
  assert.match(access, /lockForUpdate[\s\S]*for\("update", \{ of: partnerOrganizationMembers \}\)/);
  const venueAccessStart = access.indexOf("export async function authorizeVenueAccess");
  const venueAccessEnd = access.indexOf("export async function authorizeVenueCapability", venueAccessStart);
  const venueAccessBody = access.slice(venueAccessStart, venueAccessEnd);
  const organizationRow = venueAccessBody.indexOf(".from(partnerOrganizations)");
  const membershipRow = venueAccessBody.lastIndexOf("membershipRole(");
  assert.ok(organizationRow >= 0 && membershipRow > organizationRow);
  assert.match(venueAccessBody, /\.from\(partnerOrganizations\)[\s\S]*\.for\("update"\)/);
});

test("cover, reorder, update and delete execute inside short transactions", () => {
  for (const name of [
    "createVenueImage",
    "updateVenueImage",
    "reorderVenueImages",
    "deleteVenueImage",
  ]) {
    const start = writes.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `${name} must exist`);
    const next = writes.indexOf("export async function", start + 1);
    const body = writes.slice(start, next < 0 ? writes.length : next);
    assert.match(body, /db\.transaction/);
    assert.match(body, /lockAuthorizedVenue/);
  }
  assert.match(
    writes,
    /if \(input\.isCover\)[\s\S]*lockAllVenueImages[\s\S]*isCover: false[\s\S]*insert\(venueImages\)/,
  );
  assert.match(writes, /hallImageMutationFailure\(requestedHallId\)/);
  assert.equal(writes.match(/hallImageMutationFailure\(image\.hallId\)/g)?.length, 2);
  assert.match(writes, /HALL_IMAGES_USE_HALL_PATCH/);
  assert.doesNotMatch(writes, /\.insert\(venueImages\)[\s\S]{0,300}?hallId:\s*input\.hallId/);
  assert.match(writes, /\.set\(patch\)/);
  assert.match(writes, /IMAGE_DELETE_CONFLICT/);
});
