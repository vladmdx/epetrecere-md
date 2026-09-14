import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const availability = readFileSync("src/lib/booking/venue-availability.ts", "utf8");

function loopBody(startMarker: string, endMarker: string): string {
  const start = availability.indexOf(startMarker);
  const end = availability.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing ${startMarker}`);
  assert.ok(end > start, `missing ${endMarker} after ${startMarker}`);
  return availability.slice(start, end);
}

function assertBefore(body: string, first: string, second: string): void {
  const firstIndex = body.indexOf(first);
  const secondIndex = body.indexOf(second);
  assert.ok(firstIndex >= 0, `missing ${first}`);
  assert.ok(secondIndex >= 0, `missing ${second}`);
  assert.ok(firstIndex < secondIndex, `${first} must precede ${second}`);
}

test("whole-venue schedule-block conflicts precede unusable-Hall isolation", () => {
  const body = loopBody("for (const block of blocks)", "const legacyEvents");
  assertBefore(
    body,
    'if (opts.reservationScope === "venue")',
    "if (unusableHallIds.has(block.hallId)",
  );
});

test("whole-venue Google/calendar conflicts precede unusable-Hall isolation", () => {
  const body = loopBody("for (const event of legacyEvents)", "const bookings");
  assertBefore(
    body,
    'event.hallId == null || opts.reservationScope === "venue"',
    "if (unusableHallIds.has(event.hallId)",
  );
});

test("booking conflict scope is symmetric before unusable-Hall isolation", () => {
  const body = loopBody("for (const booking of bookings)", "return {\n    available: true");
  assert.match(
    body,
    /const wholeVenueConflict\s*=\s*booking\.reservationScope === "venue" \|\| opts\.reservationScope === "venue"/,
  );
  assertBefore(
    body,
    "if (wholeVenueConflict)",
    "if (booking.hallId != null && unusableHallIds.has(booking.hallId)",
  );
});

test("existing bookings use their own Hall or venue buffer", () => {
  assert.match(
    availability,
    /select\(\{[\s\S]*?id:\s*venueHalls\.id,[\s\S]*?status:\s*venueHalls\.status,[\s\S]*?bufferMinutes:\s*venueHalls\.bufferMinutes,[\s\S]*?\}\)[\s\S]*?\.from\(venueHalls\)/,
  );
  assert.match(
    availability,
    /row\.bufferMinutes \?\? venueBufferMinutes/,
  );

  const body = loopBody("for (const booking of bookings)", "return {\n    available: true");
  assert.match(
    body,
    /booking\.reservationScope === "venue" \|\| booking\.hallId == null[\s\S]*?\? venueBufferMinutes[\s\S]*?: hallBufferMinutes\.get\(booking\.hallId\) \?\? venueBufferMinutes/,
  );
  assert.match(
    body,
    /other\.endsAt\.getTime\(\) \+ existingBufferMinutes \* 60_000/,
  );
  assert.doesNotMatch(
    body,
    /other\.endsAt\.getTime\(\) \+ requestBufferMinutes \* 60_000/,
  );
});
