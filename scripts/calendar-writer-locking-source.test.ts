import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing source marker: ${start}`);
  assert.ok(to > from, `missing source marker: ${end}`);
  return text.slice(from, to);
}

test("calendar lock helper acquires every sorted entity before any sorted day", () => {
  const locks = source("../src/lib/booking/advisory-locks.ts");
  const helper = between(
    locks,
    "export async function acquireCalendarEntityDayLocks",
    "/**\n * Serialize one booking-create",
  );
  assert.match(helper, /a\.namespace - b\.namespace \|\| a\.entityId - b\.entityId/);
  assert.match(helper, /const days = \[\.\.\.new Set\(localDates\)\]\.sort\(\)/);
  assert.ok(
    helper.indexOf("for (const entity of entityLocks)")
      < helper.indexOf("for (const day of days)"),
    "all artist/venue locks must precede the first day lock",
  );
});

test("managed replacement locks, deletes, and inserts inside one transaction", () => {
  const writer = source("../src/lib/booking/calendar-write.ts");
  const primitive = between(
    writer,
    "export async function replaceManagedCalendarEventsInTransaction",
    "/**\n * Replace one managed source projection",
  );
  const lock = primitive.indexOf("await acquireCalendarEntityDayLocks");
  const authorize = primitive.indexOf("await options.authorizeAfterLocks?.(tx)");
  const remove = primitive.indexOf("await tx.delete(calendarEvents)", authorize);
  const insert = primitive.indexOf("await tx.insert(calendarEvents)", remove);
  assert.ok(lock >= 0 && lock < authorize && authorize < remove && remove < insert);
  assert.match(writer, /input\.deleteScope === "all"/);
  assert.match(writer, /hallId: null/);
  assert.doesNotMatch(primitive, /await db\.(delete|insert|update)\(calendarEvents\)/);
  assert.match(
    writer,
    /return db\.transaction\(async \(tx\) =>[\s\S]*options\.beforeLocks\?\.\(tx\)[\s\S]*replaceManagedCalendarEventsInTransaction\(tx, input/,
  );
});

test("calendar API and legacy query writer delegate to the locked replacement", () => {
  const query = source("../src/lib/db/queries/calendar.ts");
  const route = source("../src/app/api/calendar/route.ts");
  assert.match(query, /replaceManagedCalendarEvents\(\{/);
  assert.doesNotMatch(query, /await db\.(delete|insert|update)\(calendarEvents\)/);
  assert.match(route, /\.min\(1\)[\s\S]*\.max\(366\)/);
  assert.match(route, /isValidCalendarDate/);
  assert.match(route, /error instanceof CalendarWriteValidationError/);
  assert.match(route, /\{ status: 400 \}/);
});

test("artist and venue AI calendar tools use the validated locked writer", () => {
  const artistTools = source("../src/lib/ai/tools.ts");
  const artistWriter = between(
    artistTools,
    'case "update_my_calendar":',
    "\n      default:",
  );
  assert.match(artistWriter, /normalizeCalendarDates/);
  assert.match(artistWriter, /maxDates: 31/);
  assert.match(artistWriter, /bulkSetCalendarEvents/);
  assert.doesNotMatch(
    artistWriter,
    /db\.(insert|update|delete)\(calendarEvents\)/,
  );

  const venueRoute = source("../src/app/api/ai/venue-assistant/route.ts");
  const venueWriter = between(
    venueRoute,
    'toolUse.name === "block_calendar_days"',
    'toolUse.name === "recent_reviews"',
  );
  assert.match(venueWriter, /calendarDateRange/);
  assert.match(venueWriter, /maxDates: 366/);
  assert.match(venueWriter, /bulkSetCalendarEvents/);
  assert.match(venueWriter, /\.slice\([\s\S]*200/);
  assert.doesNotMatch(
    venueWriter,
    /db\.(insert|update|delete)\(calendarEvents\)/,
  );
});

test("Google sync snapshots contributors, finishes all fetches, then replaces once per entity", () => {
  const inngest = source("../src/lib/inngest/functions.ts");
  const syncService = source("../src/lib/google/calendar-sync.ts");
  const sync = between(
    inngest,
    "export const googleCalendarSync",
    "\nexport const functions",
  );
  const snapshot = sync.indexOf("await resolveGoogleCalendarJobSnapshot()");
  const fetchAll = sync.indexOf("await fetchGoogleCalendarContributorFeeds");
  const providerFetch = sync.indexOf(
    "const events = await fetchUpcomingEvents(credential.accessToken",
    fetchAll,
  );
  const plans = sync.indexOf("buildGoogleCalendarEntityPlans", providerFetch);
  const replace = sync.indexOf("await replaceGoogleCalendarEntityProjection(plan)", plans);
  assert.ok(
    snapshot >= 0
      && snapshot < fetchAll
      && fetchAll < providerFetch
      && providerFetch < plans
      && plans < replace,
    "snapshot and all provider fetches must precede every live-entity replacement",
  );
  assert.match(sync, /createGoogleCalendarSyncWindow\(new Date\(\)\)/);
  assert.match(sync, /const windowDates = \[\.\.\.syncWindow\.dates\]/);
  assert.match(sync, /concurrency: \{ limit: 1 \}/);
  assert.match(sync, /snapshots,[\s\S]*feeds,[\s\S]*windowDates/);
  assert.match(sync, /if \(plan\.action === "preserve"\)/);
  assert.doesNotMatch(sync, /replaceGoogleCalendarProjectionForUser/);
  assert.doesNotMatch(sync, /db\.(delete|insert|update)\(calendarEvents\)/);

  assert.match(syncService, /calendarEvents\.source, "google_sync"/);
  assert.match(syncService, /existingDatesByEntity/);
  assert.match(syncService, /fetchGoogleCalendarContributorFeeds/);
  assert.match(
    syncService,
    /uniqueSorted\(snapshots\.flatMap\(\(snapshot\) => snapshot\.contributorUserIds\)\)/,
  );
  assert.match(syncService, /sameContributorCredentials/);
  assert.match(syncService, /expected\.contributorCredentials/);
  assert.match(syncService, /snapshot\.contributorUserIds\.some/);
  assert.match(syncService, /action: "preserve"/);
  assert.match(syncService, /beforeLocks: \(tx\) => acquireLegalScopeLocks/);
  assert.match(syncService, /authorizeAfterLocks: \(tx\) =>/);
  assert.match(syncService, /assertGoogleCalendarEntitySnapshotExact/);
  assert.match(syncService, /sameStrings\(authorityUserIds/);
  assert.match(syncService, /sameStrings\(contributorUserIds/);
  assert.match(syncService, /deleteScope: "all"/);
  assert.match(syncService, /isNull\(venues\.organizationId\)/);
  assert.match(syncService, /candidate\.organizationStatus === "active"/);
  assert.match(syncService, /candidate\.membershipIsActive === true/);
  assert.match(syncService, /GOOGLE_CALENDAR_MANAGER_ROLES/);
});
