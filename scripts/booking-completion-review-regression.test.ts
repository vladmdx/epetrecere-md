import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { canCompleteBooking } from "../src/lib/booking/completion-eligibility";
import { moderateReview } from "../src/lib/reviews/moderation";
import { computeCommission, DEFAULT_RULES } from "../src/lib/commissions/rules";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { isUniqueViolation } from "../src/lib/reviews/duplicate-error";

test("completion requires bilateral confirmation, never accepted or terminal statuses", () => {
  const now = new Date("2026-09-07T12:00:00Z");
  for (const status of ["pending", "accepted", "rejected", "cancelled", "completed"]) {
    assert.equal(canCompleteBooking({ status, eventDate: "2026-09-06" }, now), false);
  }
  assert.equal(canCompleteBooking({ status: "confirmed_by_client", eventDate: "2026-09-06" }, now), true);
});

test("completion uses the Moldova calendar date, including UTC-midnight and DST boundaries", () => {
  for (const [instant, today] of [["2026-09-06T21:30:00Z", "2026-09-07"],
    ["2026-01-06T22:30:00Z", "2026-01-07"], ["2026-03-29T00:30:00Z", "2026-03-29"]]) {
    assert.equal(canCompleteBooking({ status: "confirmed_by_client", eventDate: today }, new Date(instant)), true);
  }
  assert.equal(canCompleteBooking({ status: "confirmed_by_client", eventDate: "2026-09-20" }, new Date("2026-09-07T12:00:00Z")), false);
  assert.equal(canCompleteBooking({ status: "confirmed_by_client", eventDate: null }), false);
  assert.equal(canCompleteBooking({ status: "confirmed_by_client", eventDate: "invalid" }), false);
});

test("both vendor completion buttons share the server-equivalent status and local-date eligibility", () => {
  const artist = readFileSync("src/app/[locale]/(vendor)/dashboard/rezervari/page.tsx", "utf8");
  const venue = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/rezervari/client.tsx", "utf8");
  assert.match(artist, /disabled=\{busy === booking\.id \|\| !canCompleteBooking\(booking\)\}/);
  assert.match(venue, /disabled=\{busy === b\.id \|\| !canCompleteBooking\(b\)\}/);
  const route = readFileSync("src/app/api/booking-requests/[id]/route.ts", "utf8");
  const complete = route.slice(route.indexOf('} else if (action === "complete")'), route.indexOf('} else if (action === "vendor_cancel")'));
  assert.match(complete, /access: \{ mode: "vendor", venueCapability: "manage_bookings" \}/);
  assert.match(complete, /current\.status !== "confirmed_by_client"/);
  assert.match(complete, /localDateInZone\([\s\S]*?current\.timezone \|\| DEFAULT_VENUE_TZ/);
  assert.match(complete, /casUpdateBookingStatus\([\s\S]*?\["confirmed_by_client"\]/);
});

test("admin moderation rejects HTTP failures and never reaches the success continuation", async () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    let changed = false;
    await assert.rejects(moderateReview(1, "approve", (async () => new Response("{}", { status })) as typeof fetch)
      .then(() => { changed = true; }));
    assert.equal(changed, false);
  }
  await assert.rejects(moderateReview(1, "reject", (async () => { throw new Error("network failed"); }) as typeof fetch), /network failed/);
});

test("admin moderation sends the intended action and permits state updates only after success", async () => {
  for (const action of ["approve", "reject"] as const) {
    await moderateReview(1, action, (async (url, init) => {
      assert.equal(url, "/api/reviews/1"); assert.equal(init?.method, "PUT");
      assert.deepEqual(JSON.parse(String(init?.body)), { action });
      return new Response('{"success":true}', { status: 200 });
    }) as typeof fetch);
  }
  const source = readFileSync("src/app/[locale]/(admin)/admin/recenzii/page.tsx", "utf8");
  const handler = source.slice(source.indexOf("async function handleAction"), source.indexOf("const filtered"));
  assert.ok(handler.indexOf("await moderateReview(id, action)") < handler.indexOf("setReviews"));
  assert.match(handler, /finally\s*\{\s*setBusy\(null\)/);
});

test("review duplicate detection handles direct SQLSTATE and actual Drizzle error wrapping", () => {
  const duplicate = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
  assert.equal(isUniqueViolation(duplicate), true);
  const wrapped = new DrizzleQueryError("insert into reviews (booking_request_id) values ($1)", [257], duplicate);
  assert.equal(wrapped.message.includes("duplicate"), false, "old message-only catch misses this real wrapper shape");
  assert.equal(isUniqueViolation(wrapped), true);
  assert.equal(isUniqueViolation(new Error("request failed", { cause: wrapped })), true);
  assert.equal(isUniqueViolation(Object.assign(new Error("duplicate appears in user review"), { code: "23502" })), false);
  assert.equal(isUniqueViolation(new Error("unique experience at this venue")), false);
  assert.equal(isUniqueViolation(null), false);
  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  assert.equal(isUniqueViolation(cycle), false);
  const source = readFileSync("src/app/api/reviews/from-booking/route.ts", "utf8");
  assert.match(source, /if \(isUniqueViolation\(e\)\) \{[\s\S]*?status: 409/);
  assert.doesNotMatch(source, /msg\.includes\("unique"\)/);
});

test("QA order amounts remain 15 EUR for artist 300 EUR and 200 EUR for wedding venue, without added VAT", () => {
  assert.deepEqual(computeCommission({ vendorType: "artist", baseAmount: 300, guestCount: 60, eventType: "wedding" }, DEFAULT_RULES),
    { amount: 15, currency: "EUR", rateBps: 500, tier: "artist_flat" });
  assert.deepEqual(computeCommission({ vendorType: "venue", baseAmount: 500, guestCount: 60, eventType: "wedding" }, DEFAULT_RULES),
    { amount: 200, currency: "EUR", rateBps: null, tier: "venue_band:wedding:0" });
  const service = readFileSync("src/lib/commissions/service.ts", "utf8");
  assert.match(service, /PAYMENT_TERM_DAYS = 30/);
  assert.match(service, /timeZone: "Europe\/Chisinau"/);
  assert.match(service, /dueDate: b\.confirmedAt \? commissionDueDate\(b\.confirmedAt\) : null/);
  assert.match(service, /amount: result\.amount/);
  assert.match(service, /onConflictDoNothing\(\{ target: commissions\.bookingRequestId \}\)/);
});

test("review creation/list require owner, final confirmation, strictly past UTC date and no existing review", () => {
  const creation = readFileSync("src/app/api/reviews/from-booking/route.ts", "utf8");
  const list = readFileSync("src/app/api/reviews/reviewable-bookings/route.ts", "utf8");
  for (const source of [creation, list]) {
    assert.match(source, /eq\(bookingRequests\.clientUserId, appUser\.id\)/);
    assert.match(source, /\["confirmed_by_client", "completed"\]/);
    assert.match(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  }
  assert.match(creation, /booking\.eventDate >= today/);
  assert.match(creation, /isApproved: false/);
  assert.match(list, /isNull\(reviews\.id\)/);
  const update = readFileSync("src/app/api/reviews/[id]/route.ts", "utf8");
  assert.match(update, /if \(action === "approve" \|\| action === "reject"\) \{\s*const admin = await requireAdmin\(\)/);
  assert.match(update, /eq\(artists\.id, review\.artistId\), eq\(artists\.userId, appUser\.id\)/);
  assert.match(update, /requireVenueCapability\(review\.venueId, "request_reviews"\)/);
  assert.match(update, /if \(!owns\) return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\)/);
});
