import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { canNegotiate, parseOfferAmount, visiblePriceOffers, type PriceOffer } from "../src/lib/booking/negotiation";
import { t } from "../src/i18n";

test("offer inputs match the API's positive integer EUR limits", () => {
  for (const [input, expected] of [["1", 1], ["450", 450], [" 750 ", 750], ["10000000", 10000000]] as const) {
    assert.equal(parseOfferAmount(input), expected);
  }
  for (const input of ["", " ", "0", "-50", "2.5", "Infinity", "NaN", "10000001", "9007199254740992", "abc"]) {
    assert.equal(parseOfferAmount(input), null, input);
  }
});

test("artist, venue and client negotiation is available only before an offer is sealed", () => {
  assert.equal(canNegotiate("pending"), true);
  for (const status of ["accepted", "confirmed_by_client", "completed", "rejected", "cancelled", "unknown"]) {
    assert.equal(canNegotiate(status), false, status);
  }
});

const offers: PriceOffer[] = [
  { from: "client", amount: 450, at: "2026-09-07T09:00:00.000Z", message: "Contact fixture@example.invalid or +37360000001, www.fixture.md" },
  { from: "artist", amount: 500, at: "2026-09-07T09:01:00.000Z", message: "Includes five hours" },
];

for (const status of ["pending", "accepted", "rejected", "cancelled"]) {
  test(`price history hides contacts in ${status} without changing prices or the source`, () => {
    const original = JSON.stringify(offers);
    const result = visiblePriceOffers(offers, status)!;
    assert.equal(JSON.stringify(offers), original);
    assert.equal(result.length, 2);
    assert.equal(result[0].amount, 450);
    assert.equal(result[0].from, "client");
    assert.equal(result[0].at, offers[0].at);
    assert.ok(!result[0].message?.includes("fixture@example.invalid"));
    assert.ok(!result[0].message?.includes("+37360000001"));
    assert.ok(!result[0].message?.includes("www.fixture.md"));
    assert.equal(result[1].message, "Includes five hours");
  });
}

test("only final bilateral confirmation reveals stored offer contacts", () => {
  assert.equal(visiblePriceOffers(offers, "confirmed_by_client"), offers);
  assert.equal(visiblePriceOffers(offers, "completed"), offers);
  assert.equal(visiblePriceOffers(null, "pending"), null);
  assert.deepEqual(visiblePriceOffers([], "pending"), []);
});

for (const locale of ["ro", "ru", "en"] as const) {
  test(`all introduced negotiation labels exist in ${locale}`, () => {
    for (const key of ["history", "yourOffer", "theirOffer", "proposePrice", "counterOffer", "proposeTitle", "amountLabel", "messageOptional", "sendOffer", "invalidAmount", "offerError", "offerSent", "networkError"]) {
      const path = `planner.negotiation.${key}`;
      assert.notEqual(t(path, locale), path);
    }
  });
}

test("venue refresh reconciles server props and query includes a redacted offer timeline", () => {
  const ui = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/rezervari/client.tsx", "utf8");
  const query = readFileSync("src/lib/db/queries/venue-bookings.ts", "utf8");
  assert.match(ui, /useEffect\(\(\) => \{ setBookings\(initialBookings\); \}, \[initialBookings\]\)/);
  assert.match(query, /priceOffers: bookingRequests\.priceOffers/);
  assert.match(query, /priceOffers: visiblePriceOffers\(r\.priceOffers, r\.status\)/);
  assert.match(ui, /b\.priceOffers\.map\(/);
});

test("both venue and client have reachable pending-only counteroffers and venue profile links", () => {
  for (const path of ["src/app/[locale]/(vendor)/dashboard/sala/rezervari/client.tsx", "src/app/[locale]/(client)/cabinet/rezervari/page.tsx"]) {
    const ui = readFileSync(path, "utf8");
    assert.match(ui, /canNegotiate\(b\.status\)/);
    assert.match(ui, /setProposeDialog\(b\)/);
    assert.match(ui, /action: "propose_price"/);
    assert.match(ui, /parseOfferAmount\(proposeAmount\)/);
    assert.match(ui, /planner\.negotiation\.counterOffer/);
  }
  const client = readFileSync("src/app/[locale]/(client)/cabinet/rezervari/page.tsx", "utf8");
  assert.match(client, /b\.venueSlug \? `\/sali\/\$\{b\.venueSlug\}`/);
  assert.match(client, /b\.artistName \?\? b\.venueName/);
  assert.match(client, /offers\.map\(/);
});
