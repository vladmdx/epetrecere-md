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

test("HTTP adapter validates an optional UUID and exposes replay semantics", () => {
  const route = readFileSync("src/app/api/booking-requests/route.ts", "utf8");
  const post = section(route, "export async function POST");
  assert.match(post, /req\.headers\.get\("idempotency-key"\)/);
  assert.match(post, /z\.string\(\)\.uuid\(\)\.safeParse/);
  assert.match(post, /code: "INVALID_IDEMPOTENCY_KEY"/);
  assert.match(post, /status: creation\.created \? 201 : 200/);
  assert.match(
    post,
    /if \(!creation\.created\)\s+response\.headers\.set\("Idempotency-Replayed", "true"\)/,
  );
});

test("writer lock order is actor, idempotency, replay, plan, callback", () => {
  const writer = readFileSync(
    "src/lib/booking/booking-request-write.ts",
    "utf8",
  );
  const create = section(
    writer,
    "export async function withBookingRequestCreation",
  );
  assertBefore(create, "lockBookingCreationActor", "options.prepare(actor)");
  assertBefore(
    create,
    "acquireBookingCreateIdempotencyLock",
    ".from(bookingRequests)",
  );
  assertBefore(
    create,
    ".from(bookingRequests)",
    "lockOwnedEventPlanAfterActor",
  );
  assertBefore(create, "lockOwnedEventPlanAfterActor", "await write(");
  assert.match(
    create,
    /existing\.creationPayloadHash !== prepared\.payloadHash/,
  );
  assert.match(create, /created: false/);
  assert.match(create, /BookingCreationIdempotencyConflictError/);
});

test("actor/category SHARE locks remain compatible with standalone FK KEY SHARE", () => {
  const writer = readFileSync(
    "src/lib/booking/booking-request-write.ts",
    "utf8",
  );
  const actorLock = section(
    writer,
    "export async function lockBookingCreationActor",
    "/** Actor is already locked",
  );
  assert.match(actorLock, /\.for\("share"\)/);
  assert.doesNotMatch(actorLock, /\.for\("update"\)/);

  const constraints = readFileSync(
    "src/lib/booking/plan-booking-constraints.ts",
    "utf8",
  );
  assert.match(
    constraints,
    /\.orderBy\(asc\(artists\.id\)\)[\s\S]*?\.for\("share"\)/,
  );
  assertBefore(constraints, "priorBooking", "targetCategoryIds.length === 0");
});

test("service owns plan constraints, availability, booking and linked offer atomically", () => {
  const service = readFileSync(
    "src/lib/booking/client-booking-create.ts",
    "utf8",
  );
  const create = section(
    service,
    "export async function createClientBookingRequest",
  );
  assert.match(create, /withBookingRequestCreation/);
  assertBefore(
    create,
    "findArtistPlanBookingConflict",
    "acquireArtistAvailabilityLocks",
  );
  assertBefore(
    create,
    "findVenuePlanBookingConflict",
    "withVenueAvailabilityWriteInTransaction",
  );
  assert.match(create, /writeTx\.insert\(offerRequests\)/);
  assert.match(create, /bookingRequestId: booking\.id/);
  assert.match(create, /artistId: data\.artistId \?\? null/);
  assert.match(create, /venueId: data\.venueId \?\? null/);
  assert.equal(create.match(/return persistOffer\(/g)?.length, 2);

  const route = readFileSync("src/app/api/booking-requests/route.ts", "utf8");
  assert.doesNotMatch(route, /insert\(offerRequests\)/);
  assert.match(route, /createClientBookingRequest\(\{/);
});

test("replay precedes current plan/scope policy and response strips internal fields", () => {
  const writer = readFileSync(
    "src/lib/booking/booking-request-write.ts",
    "utf8",
  );
  const create = section(
    writer,
    "export async function withBookingRequestCreation",
  );
  assertBefore(create, "if (existing)", "lockOwnedEventPlanAfterActor");

  const service = readFileSync(
    "src/lib/booking/client-booking-create.ts",
    "utf8",
  );
  const createService = section(
    service,
    "export async function createClientBookingRequest",
  );
  assertBefore(
    createService,
    "withBookingRequestCreation<PreparedBookingCreation>",
    "throw new PublicVenueScopeWriteError",
  );
  assertBefore(
    createService,
    "withBookingRequestCreation<PreparedBookingCreation>",
    "currentChisinauDate()",
  );
  assert.match(
    service,
    /hallId: data\.venueId \? \(data\.hallId \?\? null\) : null/,
  );
  assert.match(
    service,
    /reservationScope: data\.venueId[\s\S]*?data\.reservationScope \?\? "hall"/,
  );

  const route = readFileSync("src/app/api/booking-requests/route.ts", "utf8");
  const projection = section(
    route,
    "function bookingCreateResponse",
    "const bookingSchema",
  );
  for (const internal of [
    "creationScopeHash",
    "creationRequestId",
    "creationPayloadHash",
    "adminNotes",
    "clientSignature",
    "clientUserId",
  ]) {
    assert.doesNotMatch(projection, new RegExp(internal));
  }
});

test("create effects are transactional, durable and replay-safe", () => {
  const route = readFileSync("src/app/api/booking-requests/route.ts", "utf8");
  const post = section(route, "export async function POST");
  const writer = readFileSync(
    "src/lib/booking/booking-request-write.ts",
    "utf8",
  );
  const create = section(
    writer,
    "export async function withBookingRequestCreation",
  );
  const effects = readFileSync(
    "src/lib/booking/booking-create-effects.ts",
    "utf8",
  );
  assert.match(post, /after\(\(\) => dispatchBookingCreationEffects\(creation\)\)/);
  assert.doesNotMatch(post, /if \(creation\.created\)[\s\S]{0,100}after\(/);
  assert.match(post, /dispatchBookingCreationEffects\(creation\)/);
  assert.equal(
    create.match(/enqueueBookingEffect\(/g)?.length,
    2,
    "new writes and exact replays both ensure/reschedule one coordinator",
  );
  assert.match(create, /BOOKING_CREATION_NOTIFICATION_EFFECT/);
  const newWrite = create.slice(create.indexOf("const booking = await write"));
  assertBefore(newWrite, "const booking = await write", "await enqueueBookingEffect(");
  assertBefore(newWrite, "await enqueueBookingEffect(", "created: true");
  assert.match(effects, /BOOKING_CREATION_NOTIFICATION_EFFECT/);
  assert.match(effects, /enqueueBookingEffectDeliveries/);
  assert.match(effects, /processBookingEffectDelivery/);
  assert.match(effects, /withBookingCreationEffectDeliveryDispatchPermit/);
  assert.match(effects, /idempotencyKey: claimed\.dedupeKey/);
  assert.match(effects, /bookingCreationEffectDedupeBase/);
  assert.doesNotMatch(effects, /sendPushToUser/);
  assert.doesNotMatch(effects, /\bsendEmail\s*\(/);
  assert.match(effects, /bookingAdminNotificationMessage\(\{/);
  assert.match(effects, /bookingAutoReplyEmailHtml\(\{/);
  assert.doesNotMatch(effects, /email-\$\{booking\.clientEmail\}/);
});

test("artist target is locked and must exist active before availability", () => {
  const service = readFileSync(
    "src/lib/booking/client-booking-create.ts",
    "utf8",
  );
  const artistWrite = section(
    service,
    'if (!data.artistId) throw new Error("booking_target_required")',
    "const [row] = await tx",
  );
  assertBefore(artistWrite, "acquireArtistAvailabilityLocks", ".from(artists)");
  assertBefore(artistWrite, '.for("share")', "checkArtistAvailability");
  assertBefore(artistWrite, ".from(categories)", "checkArtistAvailability");
  assert.match(artistWrite, /eq\(artists\.isActive, true\)/);
  assert.match(
    artistWrite,
    /inArray\(categories\.type, \["artist", "service"\]\)/,
  );
  assert.match(artistWrite, /eq\(categories\.isActive, true\)/);
  assert.match(
    artistWrite,
    /targetArtist\.categoryIds \?\? \[\]\)\.includes\(requiredCategoryId\)/,
  );
  assertBefore(
    artistWrite,
    "!(targetArtist.categoryIds ?? []).includes(requiredCategoryId)",
    "checkArtistAvailability",
  );
  assert.match(artistWrite, /throw new BookingTargetUnavailableError\(\)/);

  const route = readFileSync("src/app/api/booking-requests/route.ts", "utf8");
  assert.match(route, /error instanceof BookingTargetUnavailableError/);
  assert.match(route, /code: error\.code/);
});
