import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { pendingBookingWindow } from "../src/lib/booking/response-window";
import { formatBookingDate } from "../src/lib/format/booking-date";
import { t } from "../src/i18n";

const createdAt = "2026-09-07T13:46:00Z";
const now = Date.parse("2026-09-07T14:00:00Z");

test("venue and artist bookings show their own 72h/24h response window", () => {
  assert.deepEqual(pendingBookingWindow({ createdAt, venueId: 24 }, now), {
    windowHours: 72, hours: 71, minutes: 46, expiryDue: false, awaitingClient: false,
  });
  assert.deepEqual(pendingBookingWindow({ createdAt, venueId: null }, now), {
    windowHours: 24, hours: 23, minutes: 46, expiryDue: false, awaitingClient: false,
  });
});

test("a supplier offer changes whose reply is expected, but never restarts the request expiry", () => {
  for (const venueId of [null, 24]) {
    const original = pendingBookingWindow({ createdAt, venueId }, now);
    const offered = pendingBookingWindow({ createdAt, venueId, priceOffers: [{ from: "client" }, { from: "artist" }] }, now);
    assert.deepEqual(offered, { ...original, awaitingClient: true });
    const countered = pendingBookingWindow({ createdAt, venueId, priceOffers: [{ from: "artist" }, { from: "client" }] }, now);
    assert.deepEqual(countered, original);
  }
});

test("invalid dates never render NaN, and due deadlines are clamped without claiming a server status change", () => {
  for (const value of [null, "invalid"]) {
    assert.equal(pendingBookingWindow({ createdAt: value }, now).hours, null);
    assert.equal(pendingBookingWindow({ createdAt: value }, now).expiryDue, false);
  }
  const expired = pendingBookingWindow({ createdAt, venueId: 24 }, now + 73 * 3_600_000);
  assert.deepEqual({ hours: expired.hours, minutes: expired.minutes, expiryDue: expired.expiryDue }, { hours: 0, minutes: 0, expiryDue: true });
});

for (const [locale, month] of [["ro", /septembrie/], ["ru", /сентября/], ["en", /September/]] as const) {
  test(`${locale}: booking dates use the selected language in cards, groups and dialogs`, () => {
    assert.match(formatBookingDate("2026-09-20", locale), month);
    assert.match(formatBookingDate("2026-09-20", locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), month);
    assert.match(formatBookingDate("2026-09-20", locale, { day: "numeric", month: "long", timeZone: "America/Los_Angeles" }), /20/);
    assert.match(formatBookingDate("2026-09-20", locale, { day: "numeric", month: "long", timeZone: "Pacific/Kiritimati" }), /20/);
  });
  test(`${locale}: countdown and negotiation-turn copy are translated without placeholders`, () => {
    for (const key of ["awaitingYourReply", "pendingExpiresIn", "pendingExpiryDue", "pendingExpiryUnavailable"]) {
      const translated = t(`cabinet.reservations.${key}`, locale, { hours: 71, minutes: "46" });
      assert.notEqual(translated, `cabinet.reservations.${key}`);
      assert.doesNotMatch(translated, /\{hours\}|\{minutes\}/);
      assert.doesNotMatch(translated, /24/);
    }
  });
}

test("null and impossible SQL calendar dates render a safe fallback", () => {
  for (const date of [null, undefined, "not a date", "2026-02-30"]) assert.equal(formatBookingDate(date, "en"), "-");
});

test("all three actual booking lists use the shared localized formatter and client deadline helper", () => {
  const paths = [
    "src/app/[locale]/(client)/cabinet/rezervari/page.tsx",
    "src/app/[locale]/(vendor)/dashboard/rezervari/page.tsx",
    "src/app/[locale]/(vendor)/dashboard/sala/rezervari/client.tsx",
  ];
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /formatBookingDate/);
    assert.doesNotMatch(source, /toLocaleDateString\("ro-(?:MD|RO)"/);
  }
  const client = readFileSync(paths[0], "utf8");
  assert.match(client, /<PendingCountdown booking=\{b\}/);
  assert.match(client, /pendingBookingWindow\(booking, now\)/);
  assert.match(client, /awaitingYourReply/);
  assert.doesNotMatch(client, /created \+ 24 \*/);
  assert.doesNotMatch(client, /t\("cabinet\.reservations\.countdownPrefix"\)/);
});

test("UI expiry windows match both existing server sweep policies", () => {
  for (const path of ["src/app/api/booking-requests/route.ts", "src/lib/inngest/functions.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /artistId\} IS NOT NULL\s+AND \$\{bookingRequests\.createdAt\} < NOW\(\) - INTERVAL '24 hours'/);
    assert.match(source, /venueId\} IS NOT NULL\s+AND \$\{bookingRequests\.createdAt\} < NOW\(\) - INTERVAL '72 hours'/);
  }
});
