import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { legacyVenueNotificationUrl, notificationForVenue, vendorBookingNotificationPath } from "../src/lib/notifications/venue-routing";
import { registrationStatusEmail } from "../src/lib/email/templates/registration-status";

function withMultiHallFlag(on: boolean, fn: () => void) {
  const previous = process.env.FEATURE_MULTI_HALL;
  if (on) process.env.FEATURE_MULTI_HALL = "1";
  else delete process.env.FEATURE_MULTI_HALL;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.FEATURE_MULTI_HALL;
    else process.env.FEATURE_MULTI_HALL = previous;
  }
}

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
  withMultiHallFlag(false, () => {
    assert.equal(
      vendorBookingNotificationPath({ venueId: 45, bookingId: 256 }),
      "/dashboard/sala/rezervari",
    );
    assert.equal(
      vendorBookingNotificationPath({ venueId: null, bookingId: 256 }),
      "/dashboard/rezervari",
    );
  });
  const source = readFileSync("src/app/api/booking-requests/[id]/route.ts", "utf8");
  assert.match(source, /vendorDashboardPath = vendorBookingNotificationPath\(\{\s*venueId: booking\.venueId,\s*bookingId: booking\.id,\s*\}\)/);
  assert.match(source, /actionUrl: vendorDashboardPath/);
  assert.match(source, /ctaUrl: `https:\/\/epetrecere\.md\$\{vendorDashboardPath\}`/);
});

test("venue approval and hall rejection route to the editable venue home; legacy rejection stays on contact", () => {
  const route = readFileSync("src/app/api/admin/registration-requests/route.ts", "utf8");
  const producer = readFileSync("src/lib/partner/registration-decision.ts", "utf8");
  const venueBranch = route.slice(route.indexOf('} else if (type === "venue")'));
  assert.match(producer, /isMultiHallEnabled\(\)[\s\S]*`\/dashboard\/locatii\/\$\{venueId\}`[\s\S]*"\/dashboard\/sala"/);
  assert.match(venueBranch, /isMultiHallEnabled\(\)[\s\S]*`\/dashboard\/locatii\/\$\{decidedVenue\.id\}`[\s\S]*"\/dashboard\/sala"/);
  assert.match(venueBranch, /registrationStatusEmail\(\{[\s\S]*ctaUrl: venue\.organizationId != null[\s\S]*: approvalCtaUrl/);
  const artistDecision = producer.slice(
    producer.indexOf("async function decidePartnerArtist"),
    producer.indexOf("export function approvePartnerArtist"),
  );
  assert.match(artistDecision, /type: "registration_approved"[\s\S]*actionUrl: "\/dashboard"/);
  assert.match(artistDecision, /type: "registration_rejected"[\s\S]*actionUrl: "\/contact"/);
  assert.match(
    registrationStatusEmail({
      name: "QA",
      type: "venue",
      approved: true,
      ctaUrl: "https://epetrecere.md/dashboard/locatii/42",
    }),
    /href="https:\/\/epetrecere\.md\/dashboard\/locatii\/42"/,
  );
  assert.match(registrationStatusEmail({ name: "QA", type: "venue", approved: true }), /href="https:\/\/epetrecere\.md\/dashboard\/sala"/);
  assert.match(registrationStatusEmail({ name: "QA", type: "artist", approved: true }), /href="https:\/\/epetrecere\.md\/dashboard"/);
  assert.match(registrationStatusEmail({ name: "QA", type: "venue", approved: false }), /href="https:\/\/epetrecere\.md\/contact"/);
  assert.match(registrationStatusEmail({ name: "QA", type: "venue", approved: false, hallDecision: true, ctaUrl: "https://epetrecere.md/dashboard/locatii/42" }), /href="https:\/\/epetrecere\.md\/dashboard\/locatii\/42"/);
});
