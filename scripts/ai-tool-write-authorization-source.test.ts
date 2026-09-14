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

test("venue AI profile and review writes re-authorize under live locks", () => {
  const route = source("../src/app/api/ai/venue-assistant/route.ts");
  const helper = between(
    route,
    "async function withAuthorizedVenueAiWrite",
    "function venueAiWriteFailure",
  );

  const legal = helper.indexOf("await acquireLegalScopeLocks");
  const actor = helper.indexOf("await getLockedAppUserById", legal);
  const venue = helper.indexOf('.for("update")', actor);
  const scope = helper.indexOf(
    "lockedVenue.organizationId !== input.expectedOrganizationId",
    venue,
  );
  const authorize = helper.indexOf("await authorizeVenueCapabilityLocked", scope);
  const write = helper.indexOf("return write(executor)", authorize);
  assert.ok(
    legal >= 0
      && legal < actor
      && actor < venue
      && venue < scope
      && scope < authorize
      && authorize < write,
    "live legal/actor/venue authorization must precede the transactional write",
  );

  for (const [start, end] of [
    ['toolUse.name === "reply_to_review"', 'toolUse.name === "improve_description"'],
    ['toolUse.name === "save_description"', 'toolUse.name === "generate_seo"'],
    ['toolUse.name === "save_seo"', 'toolUse.name === "analytics_summary"'],
  ] as const) {
    const branch = between(route, start, end);
    assert.match(branch, /withAuthorizedVenueAiWrite/);
    assert.doesNotMatch(branch, /await db\s*\.update\(/);
  }

  const reviewWrite = between(
    route,
    'toolUse.name === "reply_to_review"',
    'toolUse.name === "improve_description"',
  );
  assert.match(reviewWrite, /\.for\("update"\)/);
  assert.match(reviewWrite, /eq\(reviews\.venueId, venue\.id\)/);
});

test("generic AI tools carry the actor into locked artist/admin writes", () => {
  const route = source("../src/app/api/ai/chat/route.ts");
  const tools = source("../src/lib/ai/tools.ts");

  assert.match(route, /\.select\(\{ id: users\.id, role: users\.role/);
  assert.match(route, /executeTool\([\s\S]*appUser\.id\)/);

  const adminWrite = between(
    tools,
    'case "update_lead_status":',
    'case "get_my_bookings":',
  );
  const transaction = adminWrite.indexOf("return db.transaction");
  const legal = adminWrite.indexOf("await acquireLegalScopeLocks", transaction);
  const actor = adminWrite.indexOf("await getLockedAppUserById", legal);
  const target = adminWrite.indexOf('.for("update")', actor);
  const update = adminWrite.indexOf(".update(leads)", target);
  assert.ok(
    transaction >= 0
      && transaction < legal
      && legal < actor
      && actor < target
      && target < update,
    "admin role and lead row must be frozen before the lead update",
  );
  assert.match(adminWrite, /actor\?\.isGlobalAdmin/);
  assert.doesNotMatch(adminWrite, /db\.execute/);

  const artistWrite = between(
    tools,
    'case "update_my_calendar":',
    "\n      default:",
  );
  assert.match(artistWrite, /!_vendorArtistId \|\| !actorUserId/);
  assert.match(artistWrite, /artistCalendarWriteAuthorization\(\{/);
  assert.match(artistWrite, /userId: actorUserId/);
  assert.match(artistWrite, /artistId: _vendorArtistId/);
});
