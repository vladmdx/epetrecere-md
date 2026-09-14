import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routePath = "src/app/api/artist-bookings/route.ts";
const callerPath =
  "src/app/[locale]/(vendor)/dashboard/calendar/page.tsx";

test("manual create keeps the complete decision and projection in one ordered transaction", () => {
  const source = readFileSync(routePath, "utf8");
  const create = source.slice(
    source.indexOf("export async function POST"),
    source.indexOf("export async function DELETE"),
  );
  const ordered = [
    "db.transaction",
    "lockBookingCreationActor",
    "acquireBookingCreateIdempotencyLock",
    "creationPayloadHash !== payloadHash",
    "lockAuthorizedArtist(tx, input.artistId, actor)",
    "artistPackages.artistId",
    "acquireArtistAvailabilityLocks",
    "checkArtistAvailability",
    ".insert(bookingRequests)",
    ".insert(calendarEvents)",
    "bookingId: booking.id",
  ].map((needle) => {
    const index = create.indexOf(needle);
    assert.notEqual(index, -1, `missing create guarantee: ${needle}`);
    return index;
  });
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(
      ordered[i - 1] < ordered[i],
      `create lock/write order changed around item ${i}`,
    );
  }
  assert.equal(
    (create.match(/lockAuthorizedArtist\(tx, input\.artistId, actor\)/g) ?? [])
      .length,
    2,
    "both replay and new writes must re-authorize the current owner",
  );
  assert.doesNotMatch(create, /db\.insert\((bookingRequests|calendarEvents)\)/);
  assert.doesNotMatch(create, /catch\s*\{[\s\S]{0,200}calendar/i);
  assert.match(create, /status: result\.created \? 201 : 200/);
  assert.match(create, /Idempotency-Replayed/);

  const replay = create.slice(
    create.indexOf("if (existing)"),
    create.indexOf("// Freeze the target owner"),
  );
  assert.match(replay, /existing\.status === "cancelled"/);
  assert.match(replay, /"MANUAL_BOOKING_CANCELLED"/);
  assert.match(replay, /\s410,/);
  assert.match(replay, /return \{ booking: existing, created: false \}/);
  assert.ok(
    create.indexOf('existing.status === "cancelled"') <
      create.indexOf("return { booking: existing, created: false }") &&
      create.indexOf("return { booking: existing, created: false }") <
      create.indexOf(".insert(bookingRequests)"),
    "a cancelled replay must terminate, and a live replay must return, before new writes",
  );

  const responseProjection = source.slice(
    source.indexOf("function bookingResponse"),
    source.indexOf("async function appUserIdForClerk"),
  );
  assert.doesNotMatch(
    responseProjection,
    /creationScopeHash|creationRequestId|creationPayloadHash|adminNotes|clientSignature/,
  );
});

test("manual delete locks, authorizes, and tombstones only its own projection atomically", () => {
  const source = readFileSync(routePath, "utf8");
  const remove = source.slice(source.indexOf("export async function DELETE"));
  const actorLock = remove.indexOf("lockBookingCreationActor");
  const artistLock = remove.indexOf('.for("share")');
  const bookingLock = remove.indexOf('.for("update")');
  const calendarDelete = remove.indexOf(".delete(calendarEvents)");
  const bookingCancel = remove.indexOf(".update(bookingRequests)");
  assert.ok(
    actorLock >= 0 &&
      actorLock < artistLock &&
      artistLock < bookingLock &&
      bookingLock < calendarDelete,
  );
  assert.ok(calendarDelete < bookingCancel);
  for (const guard of [
    'eq(calendarEvents.bookingId, booking.id)',
    'eq(calendarEvents.entityType, "artist")',
    'eq(calendarEvents.entityId, booking.artistId)',
    'eq(calendarEvents.source, "booking")',
    'eq(bookingRequests.source, "manual")',
    "exists(ownedArtist)",
  ]) {
    assert.ok(remove.includes(guard), `missing delete guard: ${guard}`);
  }
  const tombstoneSet = remove.slice(
    remove.indexOf(".set({"),
    remove.indexOf(".where(", remove.indexOf(".set({")),
  );
  for (const tombstone of [
    'status: "cancelled"',
    'clientName: "Rezervare manuală anulată"',
    "message: null",
    "priceOffers: []",
  ]) {
    assert.ok(
      tombstoneSet.includes(tombstone),
      `missing tombstone field: ${tombstone}`,
    );
  }
  for (const retained of [
    "creationScopeHash",
    "creationRequestId",
    "creationPayloadHash",
  ]) {
    assert.doesNotMatch(
      tombstoneSet,
      new RegExp(`${retained}\\s*:`),
      `cancellation must retain ${retained}`,
    );
  }
  assert.doesNotMatch(remove, /\.delete\(bookingRequests\)/);
  assert.doesNotMatch(
    remove,
    /Endpoint supports only artist bookings|Only manual bookings can be deleted here/,
    "authenticated callers must not get a booking kind/source existence oracle",
  );
});

test("booking GET hides only cancelled manual tombstones before LIMIT", () => {
  const source = readFileSync("src/app/api/booking-requests/route.ts", "utf8");
  const get = source.slice(
    source.indexOf("export async function GET"),
    source.indexOf("// CREATE booking request"),
  );
  assert.match(
    get,
    /NOT \(\s*\$\{bookingRequests\.source\} = 'manual'\s*AND \$\{bookingRequests\.status\} = 'cancelled'/,
  );
  assert.match(get, /const conditions(?:: SQL\[\])? = \[visibleBooking\]/);
  assert.match(get, /\.where\(and\(\.\.\.conditions\)\)[\s\S]*?\.limit\(50\)/);
});

test("calendar caller uses the stable-key helper and refreshes both views", () => {
  const source = readFileSync(callerPath, "utf8");
  assert.match(source, /submitManualArtistBooking\(\{/);
  assert.doesNotMatch(source, /fetch\(["']\/api\/artist-bookings["']/);
  assert.match(
    source,
    /bookingDeleted[\s\S]{0,180}Promise\.all\(\[refreshDayBookings\(\), loadEvents\(\)\]\)/,
  );
});
