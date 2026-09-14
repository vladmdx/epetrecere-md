import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("commission API filters venue access by the financial capability", () => {
  const body = source("src/app/api/commissions/route.ts");
  assert.match(body, /listVenueIdsForCapability\([\s\S]*"manage_financials"/);
  assert.match(body, /authorizeVenueCapability\([\s\S]*requestedVenueId[\s\S]*"manage_financials"/);
  assert.match(body, /eq\(commissions\.venueId, requestedVenueId\)/);
  assert.match(body, /Invalid venueId/);
  assert.match(body, /Cache-Control["']:\s*["']private, no-store/);
  assert.doesNotMatch(body, /listAccessibleVenueIds/);
});

test("financial venue page authorizes before reading and redacts premature identity", () => {
  const body = source(
    "src/app/[locale]/(vendor)/dashboard/locatii/[venueId]/financiar/page.tsx",
  );
  const authorize = body.indexOf("await requireVenueCapability");
  const bookingRead = body.indexOf(".from(bookingRequests)");
  const commissionRead = body.indexOf(".from(commissions)");
  assert.ok(authorize >= 0);
  assert.ok(bookingRead > authorize);
  assert.ok(commissionRead > authorize);
  assert.match(body, /<CommissionPanel venueId=\{venue\.id\}/);
  assert.match(body, /contactsAreShared\(b\.status\) \? b\.clientName : `#\$\{b\.id\}`/);
  assert.match(body, /contactsAreShared\(b\.status\) \? b\.eventType : null/);
});

test("venue shell and home hide financial data without capability", () => {
  const layout = source(
    "src/app/[locale]/(vendor)/dashboard/locatii/[venueId]/layout.tsx",
  );
  const page = source(
    "src/app/[locale]/(vendor)/dashboard/locatii/[venueId]/page.tsx",
  );
  const sidebar = source("src/components/vendor/venue-sidebar.tsx");
  const home = source(
    "src/app/[locale]/(vendor)/dashboard/sala/home-client.tsx",
  );
  assert.match(layout, /requireVenueCapability\([\s\S]*"manage_financials"/);
  assert.match(layout, /canManageFinancials=\{financialAccess\.ok\}/);
  assert.match(page, /includeFinancials: canManageFinancials/);
  assert.match(page, /canManageFinancials=\{canManageFinancials\}/);
  assert.match(sidebar, /item\.href !== "\/financiar" \|\| canManageFinancials/);
  assert.match(sidebar, /canManageFinancials = false/);
  assert.match(home, /\{canManageFinancials && <KpiCard[\s\S]*kpiRevenue/);
  assert.match(home, /canManageFinancials=\{canManageFinancials\}/);
});

test("financial queries and row prices are opt-in rather than zero-only redaction", () => {
  const body = source("src/lib/db/queries/venue-stats.ts");
  assert.match(body, /const includeFinancials = options\.includeFinancials === true/);
  assert.match(body, /if \(includeFinancials\) \{[\s\S]*SUM\([\s\S]*priceAgreed/);
  assert.match(body, /priceAgreed: options\.includeFinancials === true[\s\S]*\? bookingRequests\.agreedPrice[\s\S]*: sql<number \| null>`null`/);
  assert.match(body, /priceAgreed: options\.includeFinancials === true \? row\.priceAgreed : null/);
  const api = source("src/app/api/me/venue/stats/route.ts");
  assert.match(api, /authorizeVenueCapability\([\s\S]*"manage_financials"/);
  assert.match(api, /includeFinancials: canManageFinancials/);
  assert.match(api, /stats, canManageFinancials/);
});

test("commission panel sends the selected venue id to the API", () => {
  const body = source("src/components/vendor/commission-panel.tsx");
  assert.match(body, /venueId\?: number/);
  assert.match(body, /\?venueId=\$\{encodeURIComponent\(String\(venueId\)\)\}/);
  assert.match(body, /\[venueId\]/);
});

test("capability-scoped venue listing applies the role threshold", () => {
  const body = source("src/lib/venue-access.ts");
  const start = body.indexOf("export async function listVenueIdsForCapability");
  const end = body.indexOf("/** Full venue rows", start);
  const scope = body.slice(start, end);
  assert.match(scope, /VENUE_CAPABILITY_MIN_ROLE\[capability\]/);
  assert.match(scope, /partnerOrganizationMembers\.role/);
  assert.match(scope, /meetsRole\(role, minimumRole\)/);
  assert.match(scope, /partnerOrganizationMembers\.isActive/);
  assert.match(scope, /ORG_STATUSES_ALLOWING_ACCESS/);
});
