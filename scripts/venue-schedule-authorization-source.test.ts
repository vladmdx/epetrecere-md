import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const writer = readFileSync(
  "src/lib/booking/venue-schedule-write.ts",
  "utf8",
);
const route = readFileSync(
  "src/app/api/venues/[id]/schedule-blocks/route.ts",
  "utf8",
);

test("every schedule mutation re-authorizes the actor inside its transaction", () => {
  assert.match(writer, /async function authorizeVenueScheduleWrite\(/);
  assert.match(writer, /acquireLegalScopeLocks\([\s\S]*acquireAvailabilityLocks\(/);
  assert.match(writer, /getLockedAppUserById\([\s\S]*\.for\("update"\)[\s\S]*authorizeVenueCapabilityLocked\(/);
  assert.match(writer, /currentVenue\.organizationId !== expected\.organizationId/);

  for (const functionName of [
    "createVenueScheduleBlock",
    "applyVenueScheduleBlocksBulk",
    "deleteVenueScheduleBlocks",
  ]) {
    const start = writer.indexOf(`export async function ${functionName}`);
    assert.ok(start >= 0, `${functionName} exists`);
    const next = writer.indexOf("export async function ", start + 1);
    const body = writer.slice(start, next < 0 ? undefined : next);
    const transaction = body.indexOf("db.transaction(async (tx)");
    const authorization = body.indexOf("authorizeVenueScheduleWrite(");
    assert.ok(
      transaction >= 0 && transaction < authorization,
      `${functionName} authorizes inside its write transaction`,
    );
  }
});

test("the route passes the authenticated actor into create, bulk and delete writes", () => {
  assert.match(route, /createdBy: access\.user\.id/g);
  assert.match(route, /actorUserId: access\.user\.id/);
});

test("manual clear/delete cannot remove external calendar projections", () => {
  const clearablePredicates = writer.match(
    /clearableManualScheduleBlock\(\)/g,
  );
  assert.ok(
    (clearablePredicates?.length ?? 0) >= 4,
    "bulk clear, id delete, and day delete are scoped to manual rows",
  );
  assert.match(
    writer,
    /backfill_0028:calendar_events[\s\S]*venueScheduleBlocks\.kind, "manual"/,
  );
  assert.doesNotMatch(
    writer,
    /delete\(venueScheduleBlocks\)[\s\S]{0,400}eq\(venueScheduleBlocks\.source, "external_calendar"\)/,
  );
});
