import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { legacyVenueNotificationUrl, notificationForVenue, vendorBookingNotificationPath } from "../src/lib/notifications/venue-routing";
import { registrationStatusEmail } from "../src/lib/email/templates/registration-status";

test("known venue history links preserve language, query and anchor without changing stored text", () => {
  for (const prefix of ["", "/en", "/ru"]) {
    const booking = { type: "booking_request_new", actionUrl: `${prefix}/dashboard/rezervari?expand=256#offer`, title: "QA Test client a propus un preț" };
    const original = JSON.stringify(booking);
    const projected = notificationForVenue(booking);
    assert.equal(projected.actionUrl, `${prefix}/dashboard/sala/rezervari?expand=256#offer`);
    assert.equal(projected.title, booking.title);
    assert.equal(JSON.stringify(booking), original);
    assert.equal(legacyVenueNotificationUrl({ type: "registration_approved", actionUrl: `${prefix}/dashboard` }), `${prefix}/dashboard/sala`);
  }
});

test("unrelated, ambiguous, already-correct and external links are not rewritten", () => {
  for (const item of [
    { type: "review_new", actionUrl: "/dashboard/rezervari" },
    { type: "registration_rejected", actionUrl: "/contact" },
    { type: "booking_request_new", actionUrl: "/cabinet/rezervari" },
    { type: "booking_request_new", actionUrl: "/dashboard/sala/rezervari" },
    { type: "registration_approved", actionUrl: "https://external.invalid/dashboard" },
    { type: "registration_approved", actionUrl: "//external.invalid/dashboard" },
    { actionUrl: "/dashboard" },
    { type: "registration_approved", actionUrl: null },
  ]) {
    assert.equal(legacyVenueNotificationUrl(item), null);
    assert.equal(notificationForVenue(item), item);
  }
  assert.equal(legacyVenueNotificationUrl({ type: "registration_approved", actionUrl: "https://epetrecere.md/en/dashboard" }), "/en/dashboard/sala");
});

test("new counteroffer notifications and email CTAs use the correct vendor destination", () => {
  assert.equal(vendorBookingNotificationPath(45), "/dashboard/sala/rezervari");
  assert.equal(vendorBookingNotificationPath(null), "/dashboard/rezervari");
  const source = readFileSync("src/app/api/booking-requests/[id]/route.ts", "utf8");
  assert.match(source, /vendorDashboardPath = vendorBookingNotificationPath\(booking\.venueId\)/);
  assert.match(source, /actionUrl: vendorDashboardPath/);
  assert.match(source, /ctaUrl: `https:\/\/epetrecere\.md\$\{vendorDashboardPath\}`/);
});

test("venue approval producer and email route to the venue home while artist/rejection routes remain unchanged", () => {
  const source = readFileSync("src/app/api/admin/registration-requests/route.ts", "utf8");
  const venueBranch = source.slice(source.indexOf('} else if (type === "venue")'));
  assert.match(venueBranch, /actionUrl: "\/dashboard\/sala"/);
  assert.match(source.slice(0, source.indexOf('} else if (type === "venue")')), /actionUrl: "\/dashboard"/);
  assert.match(registrationStatusEmail({ name: "QA", type: "venue", approved: true }), /href="https:\/\/epetrecere\.md\/dashboard\/sala"/);
  assert.match(registrationStatusEmail({ name: "QA", type: "artist", approved: true }), /href="https:\/\/epetrecere\.md\/dashboard"/);
  assert.match(registrationStatusEmail({ name: "QA", type: "venue", approved: false }), /href="https:\/\/epetrecere\.md\/contact"/);
});
