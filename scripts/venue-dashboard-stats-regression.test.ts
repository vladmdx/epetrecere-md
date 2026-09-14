import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { finalizedLegacyVenueBookingsInMonth, finalizedVenueBookingsInMonth, venueDashboardMonths } from "../src/lib/vendors/dashboard-bookings";
import { LegacyVenueHistory } from "../src/components/vendor/legacy-venue-history";

for (const [instant, start, next, last, days] of [
  ["2026-09-07T12:00:00Z", "2026-09-01", "2026-10-01", "2026-08-01", 30],
  ["2026-08-31T21:30:00Z", "2026-09-01", "2026-10-01", "2026-08-01", 30],
  ["2026-08-31T20:59:00Z", "2026-08-01", "2026-09-01", "2026-07-01", 31],
  ["2026-12-31T22:30:00Z", "2027-01-01", "2027-02-01", "2026-12-01", 31],
  ["2028-02-29T10:00:00Z", "2028-02-01", "2028-03-01", "2028-01-01", 29],
  ["2026-02-28T10:00:00Z", "2026-02-01", "2026-03-01", "2026-01-01", 28],
] as const) {
  test(`month boundaries use Moldova local calendar: ${instant}`, () => {
    assert.deepEqual(venueDashboardMonths(new Date(instant)), {
      monthYear: Number(start.slice(0, 4)), monthIndex: Number(start.slice(5, 7)) - 1,
      monthStart: start, nextMonthStart: next, lastMonthStart: last, daysInMonth: days,
    });
  });
}

test("mini-calendar and stats share the exact same Moldova reporting instant and exclusive month bounds", () => {
  const page = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/page.tsx", "utf8");
  const stats = readFileSync("src/lib/db/queries/venue-stats.ts", "utf8");
  assert.match(page, /const \{ monthStart, nextMonthStart, monthYear, monthIndex \} = venueDashboardMonths\(now\)/);
  assert.match(page, /getVenueStats\(venue\.id, now, \{ includeFinancials: canManageFinancials \}\)/);
  assert.match(stats, /getVenueStats\([\s\S]*venueId: number,[\s\S]*now = new Date\(\)/);
  assert.match(stats, /venueDashboardMonths\(now\)/);
  assert.match(page, /gte\(calendarEvents\.date, monthStart\)/);
  assert.match(page, /lt\(calendarEvents\.date, nextMonthStart\)/);
  assert.match(page, /monthYear=\{monthYear\}/);
  assert.match(page, /monthIndex=\{monthIndex\}/);
  assert.doesNotMatch(page, /now\.getFullYear\(|now\.getMonth\(|monthEndIso/);
  assert.match(page, /eq\(calendarEvents\.entityType, "venue"\)/);
  assert.match(page, /eq\(calendarEvents\.entityId, venue\.id\)/);
});

test("unified monthly SQL uses venue ownership, finalized statuses and bounded event dates", () => {
  const { sql, params } = new PgDialect().sqlToQuery(finalizedVenueBookingsInMonth(24, "2026-09-01", "2026-10-01")!);
  assert.deepEqual(params, [24, "confirmed_by_client", "completed", "2026-09-01", "2026-10-01"]);
  assert.match(sql, /"booking_requests"\."venue_id" = \$1/);
  assert.match(sql, /"event_date" >= \$4/);
  assert.match(sql, /"event_date" < \$5/);
  assert.doesNotMatch(sql, /updated_at|"bookings"/);
  assert.ok(!params.includes("pending") && !params.includes("accepted"));
});

test("legacy archive SQL retains its own statuses instead of conflating sources", () => {
  const { sql, params } = new PgDialect().sqlToQuery(finalizedLegacyVenueBookingsInMonth("2026-09-01", "2026-10-01")!);
  assert.deepEqual(params, ["confirmed", "completed", "2026-09-01", "2026-10-01"]);
  assert.match(sql, /"bookings"\."status"/);
  assert.doesNotMatch(sql, /booking_requests/);
});

test("new requests and recent rows use the same source and IDs as the quick-action API", () => {
  const source = readFileSync("src/lib/db/queries/venue-stats.ts", "utf8");
  assert.match(source, /and\(eq\(bookingRequests\.venueId, venueId\), eq\(bookingRequests\.status, "pending"\)\)/);
  const recent = source.slice(source.indexOf("export async function getVenueRecentBookings("), source.indexOf("export async function getVenueLegacyRecentBookings("));
  assert.match(recent, /id: bookingRequests\.id/);
  assert.match(recent, /guestCount: bookingRequests\.guestCount/);
  assert.match(recent, /\? bookingRequests\.agreedPrice\s*: sql<number \| null>`null`/);
  assert.match(recent, /\.where\(eq\(bookingRequests\.venueId, venueId\)\)/);
  assert.match(recent, /desc\(bookingRequests\.createdAt\), desc\(bookingRequests\.id\)/);
  assert.doesNotMatch(recent, /from\(bookings\)|leftJoin\(leads/);
  assert.match(source, /legacy: \{[\s\S]*totalBookings: Number\(legacyRow/);
  assert.match(source, /\.from\(bookings\)\s*\.where\(eq\(bookings\.venueId, venueId\)\)/);
});

const summary = { totalBookings: 2, pendingBookings: 1, confirmedThisMonth: 1, revenueThisMonth: 450, revenueLastMonth: 600 };
for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: historical totals remain visible without actionable legacy IDs`, () => {
    const html = renderToStaticMarkup(createElement(LegacyVenueHistory, { locale, summary, canManageFinancials: true, rows: [{ id: 256, clientName: "QA Legacy Client", eventType: "wedding", eventDate: "2026-09-05", guestCount: 80, status: "confirmed", priceAgreed: 450 }] }));
    assert.match(html, /data-legacy-venue-history/);
    assert.match(html, /QA Legacy Client/);
    assert.match(html, /450 €/);
    assert.match(html, /600 €/);
    assert.doesNotMatch(html, /<button|href=|booking-requests|vendor\.venueHome\./);
  });
}

test("empty legacy archive is omitted for new venues", () => {
  assert.equal(renderToStaticMarkup(createElement(LegacyVenueHistory, { locale: "en", summary: { ...summary, totalBookings: 0 }, rows: [], canManageFinancials: false })), "");
});

test("home quick reject and post-refresh badges follow unified booking statuses", () => {
  const source = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/home-client.tsx", "utf8");
  assert.match(source, /action: "reject"/);
  assert.doesNotMatch(source, /action: "decline"/);
  assert.match(source, /useEffect\(\(\) => \{ setRecentBookings\(initialBookings\); \}, \[initialBookings\]\)/);
  assert.match(source, /status === "confirmed_by_client" \? "confirmed"/);
  assert.match(source, /status === "rejected" \? "declined"/);
  assert.match(source, /<LegacyVenueHistory[\s\S]*summary=\{stats\.legacy\}[\s\S]*rows=\{legacyBookings\}/);
});

test("legacy financial values are omitted without manage_financials", () => {
  const html = renderToStaticMarkup(createElement(LegacyVenueHistory, {
    locale: "ro",
    summary,
    canManageFinancials: false,
    rows: [{ id: 256, clientName: "QA Legacy Client", eventType: "wedding", eventDate: "2026-09-05", guestCount: 80, status: "confirmed", priceAgreed: null }],
  }));
  assert.doesNotMatch(html, /450 €/);
  assert.doesNotMatch(html, /600 €/);
});
