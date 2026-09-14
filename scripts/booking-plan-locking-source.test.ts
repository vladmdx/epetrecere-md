import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function section(
  source: string,
  startMarker: string,
  endMarker?: string,
): string {
  const start = source.indexOf(startMarker);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  assert.ok(start >= 0, `missing ${startMarker}`);
  assert.ok(end > start, `missing ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

function assertBefore(source: string, first: string, second: string): void {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex >= 0, `missing ${first}`);
  assert.ok(secondIndex >= 0, `missing ${second}`);
  assert.ok(firstIndex < secondIndex, `${first} must precede ${second}`);
}

test("actor then plan ownership are locked inside the shared booking transaction", () => {
  const source = readFileSync(
    "src/lib/booking/booking-request-write.ts",
    "utf8",
  );
  const actorLock = section(
    source,
    "export async function lockBookingCreationActor",
    "/** Actor is already locked",
  );
  const planLock = section(
    source,
    "export async function lockOwnedEventPlanAfterActor",
    "/**\n * Serialize every artist/venue",
  );
  const wrapper = section(
    source,
    "export async function withBookingRequestWrite",
  );

  assert.match(actorLock, /eq\(users\.id, userId\)/);
  assert.match(actorLock, /\.for\("share"\)/);
  assert.match(planLock, /eq\(eventPlans\.id, scope\.eventPlanId\)/);
  assert.match(planLock, /eq\(eventPlans\.userId, scope\.userId\)/);
  assert.match(planLock, /\.for\("update"\)/);
  assert.match(planLock, /throw new EventPlanBookingWriteError\(\)/);
  assert.match(wrapper, /db\.transaction/);
  assertBefore(
    wrapper,
    "lockOwnedEventPlanForBookingWrite(tx, scope)",
    "write(tx)",
  );
});

test("POST revalidates artist and venue plan slots after the plan lock", () => {
  const route = readFileSync("src/app/api/booking-requests/route.ts", "utf8");
  const post = section(route, "export async function POST");
  const writer = readFileSync(
    "src/lib/booking/booking-request-write.ts",
    "utf8",
  );
  const creationWriter = section(
    writer,
    "export async function withBookingRequestCreation",
  );
  const service = readFileSync(
    "src/lib/booking/client-booking-create.ts",
    "utf8",
  );
  const transaction = section(
    service,
    "export async function createClientBookingRequest",
  );

  assert.doesNotMatch(
    post.slice(0, post.indexOf("createClientBookingRequest({")),
    /\.from\(eventPlans\)/,
    "ownership must not be trusted from a pre-transaction plan read",
  );
  assertBefore(
    creationWriter,
    "lockOwnedEventPlanAfterActor",
    "await write(tx, prepared.value",
  );
  assert.match(
    transaction,
    /findArtistPlanBookingConflict\(\s*executor,\s*data\.eventPlanId,\s*data\.artistId/,
  );
  assert.match(
    transaction,
    /findVenuePlanBookingConflict\(\s*executor,\s*data\.eventPlanId,\s*data\.venueId/,
  );
  assertBefore(
    transaction,
    "findArtistPlanBookingConflict",
    "acquireArtistAvailabilityLocks",
  );
  assertBefore(
    transaction,
    "findVenuePlanBookingConflict",
    "withVenueAvailabilityWriteInTransaction",
  );
  assert.match(
    transaction,
    /checkArtistAvailability\(\{[\s\S]*?executor,[\s\S]*?\}\)/,
  );
  assert.equal(
    transaction.match(/\.insert\(bookingRequests\)/g)?.length,
    2,
    "both venue and artist inserts must use the guarded transaction",
  );
  assert.doesNotMatch(post, /insert\(bookingRequests\)/);
});

test("venue availability can join a parent-locked transaction without nesting", () => {
  const source = readFileSync("src/lib/booking/venue-booking-write.ts", "utf8");
  const inTransaction = section(
    source,
    "export async function withVenueAvailabilityWriteInTransaction",
    "/**\n * Lock + re-check + write",
  );
  const standalone = section(
    source,
    "export async function withVenueAvailabilityWrite<T>",
    "export async function assertVenueAvailableForWrite",
  );

  assert.doesNotMatch(inTransaction, /db\.transaction/);
  assertBefore(inTransaction, "const first", "acquireAvailabilityLocks");
  assertBefore(inTransaction, "acquireAvailabilityLocks", "const second");
  assertBefore(inTransaction, "const second", "return write(tx, second)");
  assert.match(
    standalone,
    /db\.transaction\(\(tx\)\s*=>\s*withVenueAvailabilityWriteInTransaction\(tx, input, write\)/,
  );
});

test("the lock graph has no availability-to-plan reverse edge", () => {
  const transitions = readFileSync(
    "src/lib/booking/booking-transitions.ts",
    "utf8",
  );
  const planRoute = readFileSync(
    "src/app/api/event-plans/[id]/route.ts",
    "utf8",
  );

  assert.doesNotMatch(transitions, /lockOwnedEventPlanForBookingWrite/);
  assert.doesNotMatch(planRoute, /acquireAvailabilityLocks/);
  assert.doesNotMatch(planRoute, /withVenueAvailabilityWrite/);
});

test("confirmation locks live vendor parents before booking and commission effects", () => {
  const transitions = readFileSync(
    "src/lib/booking/booking-transitions.ts",
    "utf8",
  );
  const persistence = readFileSync(
    "src/lib/booking/confirmation-persist.ts",
    "utf8",
  );
  const effects = readFileSync(
    "src/lib/booking/confirmation-effects.ts",
    "utf8",
  );

  const parentLock = section(
    persistence,
    "export async function lockConfirmationVendorParents",
    "export async function projectBookingOntoCalendar",
  );
  assertBefore(parentLock, ".from(artists)", ".from(venues)");
  assertBefore(parentLock, ".from(venues)", ".from(venueHalls)");
  assert.equal(parentLock.match(/\.for\("share"\)/g)?.length, 3);

  const confirm = section(
    transitions,
    "export async function confirmBookingWithEffects",
    "export async function replayConfirmationEffects",
  );
  assertBefore(confirm, "lockConfirmationVendorParents", "const row = await write");
  assertBefore(confirm, "bookingVendorTupleMatches", "persistConfirmationEffects");

  const replay = section(
    transitions,
    "export async function replayConfirmationEffects",
    "function bookingVendorTupleMatches",
  );
  assertBefore(replay, "lockConfirmationVendorParents", '.from(bookingRequests)');
  assertBefore(replay, '.for("update")', "persistConfirmationEffects");
  assertBefore(replay, "bookingVendorTupleMatches", "persistConfirmationEffects");

  assert.match(
    effects,
    /finalConfirmationEffects[\s\S]*replayConfirmationEffects\(b\)/,
  );
});

test("legacy conflict messages and active statuses remain stable", () => {
  const constraints = readFileSync(
    "src/lib/booking/plan-booking-constraints.ts",
    "utf8",
  );

  for (const status of [
    "pending",
    "accepted",
    "confirmed_by_client",
    "completed",
  ]) {
    assert.match(constraints, new RegExp(`\\"${status}\\"`));
  }
  assert.match(
    constraints,
    /Ai trimis deja o cerere la această sală pentru acest eveniment\./,
  );
  assert.match(
    constraints,
    /Așteaptă răspunsul de la \$\{blocker\.venueName \?\? "sală"\} \(până la 72h\)/,
  );
  assert.match(
    constraints,
    /Ai trimis deja o cerere către acest artist pentru acest eveniment\./,
  );
  assert.match(
    constraints,
    /Așteaptă răspunsul lui \$\{blockerName \?\? "artist"\} \(până la 24h\)/,
  );
});
