import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  reviewHallIdFromBooking,
  reviewableVenueHallProjection,
} from "../src/lib/reviews/hall-context";
import {
  vendorBookingNotificationPath,
  vendorReviewNotificationPath,
} from "../src/lib/notifications/venue-routing";
import {
  notificationContext,
  notificationContextMatchesResource,
} from "../src/lib/privacy/notification-context";
import {
  filterLegalAcceptancesForScope,
  legalAcceptancesListScope,
  parseLegalListOrganizationId,
} from "../src/lib/legal/acceptance-list-scope";

function withFlag(on: boolean, fn: () => void) {
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

test("review created from a venue booking copies booking.hallId onto reviews.hallId", () => {
  const booking = { venueId: 8, hallId: 11 };
  assert.equal(reviewHallIdFromBooking(booking), booking.hallId);
  assert.equal(reviewHallIdFromBooking({ venueId: 8, hallId: 12 }), 12);
  assert.equal(reviewHallIdFromBooking({ venueId: 8, hallId: null }), null);
  assert.equal(reviewHallIdFromBooking({ venueId: null, hallId: 11 }), null);
  const source = readFileSync("src/app/api/reviews/from-booking/route.ts", "utf8");
  assert.match(source, /hallId: reviewHallIdFromBooking\(booking\)/);
  assert.match(source, /vendorReviewNotificationPath\(booking\.venueId\)/);
  assert.doesNotMatch(source, /getLocalized\([^)]*hall/);
});

test("reviewable bookings return Grand and Garden hall identity without extra private fields", () => {
  assert.deepEqual(
    reviewableVenueHallProjection({ venueId: 8, hallId: 11, hallName: "Grand" }),
    { hallId: 11, hallName: "Grand" },
  );
  assert.deepEqual(
    reviewableVenueHallProjection({ venueId: 8, hallId: 12, hallName: "Garden" }),
    { hallId: 12, hallName: "Garden" },
  );
  assert.deepEqual(
    reviewableVenueHallProjection({ venueId: null, hallId: 11, hallName: "Grand" }),
    { hallId: null, hallName: null },
  );
  const source = readFileSync("src/app/api/reviews/reviewable-bookings/route.ts", "utf8");
  assert.match(source, /reviewableVenueHallProjection\(/);
  assert.match(source, /leftJoin\(venueHalls, eq\(venueHalls\.id, bookingRequests\.hallId\)\)/);
  assert.doesNotMatch(source, /basePrice|depositValue|workingHours|userAgent/);
  const locatii = readFileSync(
    "src/app/[locale]/(vendor)/dashboard/locatii/[venueId]/recenzii/page.tsx",
    "utf8",
  );
  assert.match(locatii, /hallName: venueHalls\.nameRo/);
  const client = readFileSync(
    "src/app/[locale]/(vendor)/dashboard/sala/recenzii/client.tsx",
    "utf8",
  );
  assert.match(client, /review\.hallName \? ` · \$\{review\.hallName\}`/);
});

test("feature flag ON uses canonical locatii+expand; OFF keeps legacy sala path", () => {
  withFlag(false, () => {
    assert.equal(
      vendorBookingNotificationPath({ venueId: 10, bookingId: 100 }),
      "/dashboard/sala/rezervari",
    );
    assert.equal(vendorReviewNotificationPath(10), "/dashboard/sala/recenzii");
  });
  withFlag(true, () => {
    assert.equal(
      vendorBookingNotificationPath({ venueId: 10, bookingId: 100 }),
      "/dashboard/locatii/10/rezervari?expand=100",
    );
    assert.equal(vendorReviewNotificationPath(10), "/dashboard/locatii/10/recenzii");
  });
});

test("two venues keep exact venueId+bookingId in notification URLs", () => {
  withFlag(true, () => {
    assert.equal(
      vendorBookingNotificationPath({ venueId: 10, bookingId: 100 }),
      "/dashboard/locatii/10/rezervari?expand=100",
    );
    assert.equal(
      vendorBookingNotificationPath({ venueId: 20, bookingId: 200 }),
      "/dashboard/locatii/20/rezervari?expand=200",
    );
    assert.notEqual(
      vendorBookingNotificationPath({ venueId: 10, bookingId: 100 }),
      vendorBookingNotificationPath({ venueId: 20, bookingId: 200 }),
    );
  });
  const effects = readFileSync("src/lib/booking/booking-create-effects.ts", "utf8");
  assert.match(effects, /vendorBookingNotificationPath\(\{\s*venueId: booking\.venueId,\s*bookingId: booking\.id,\s*\}\)/);
});

test("URL venueId mismatch against the verified resource fails closed", () => {
  const canonical = notificationContext("/dashboard/locatii/10/rezervari?expand=100");
  assert.deepEqual(canonical, { kind: "booking", id: 100, venueId: 10 });
  assert.equal(
    notificationContextMatchesResource(canonical!, { venueId: 10 }),
    true,
  );
  assert.equal(
    notificationContextMatchesResource(canonical!, { venueId: 20 }),
    false,
  );
  assert.equal(
    notificationContextMatchesResource(canonical!, { venueId: null }),
    false,
  );
  assert.equal(notificationContext("/dashboard/locatii/10/rezervari"), null);
  assert.equal(notificationContext("/dashboard/locatii/0/rezervari?expand=100"), null);
  const view = readFileSync("src/lib/privacy/notification-view.ts", "utf8");
  assert.match(view, /notificationContextMatchesResource\(context, booking\)/);
  assert.match(view, /notificationContextMatchesResource\(context, conversation\)/);
});

test("same user in two organizations sees each organization's documents separately", () => {
  const rows = [
    { id: 1, organizationId: 1, userId: "user-a" },
    { id: 2, organizationId: 2, userId: "user-a" },
    { id: 3, organizationId: null, userId: "user-a" },
  ];
  const org1 = legalAcceptancesListScope({
    userId: "user-a",
    organizationId: 1,
    orgAccessOk: true,
  });
  const org2 = legalAcceptancesListScope({
    userId: "user-a",
    organizationId: 2,
    orgAccessOk: true,
  });
  assert.equal(org1.ok && org2.ok, true);
  if (!org1.ok || !org2.ok) return;
  assert.deepEqual(filterLegalAcceptancesForScope(rows, org1.scope).map((row) => row.id), [1]);
  assert.deepEqual(filterLegalAcceptancesForScope(rows, org2.scope).map((row) => row.id), [2]);
});

test("without organizationId the list is personal/legacy only, never organizational rows", () => {
  assert.equal(parseLegalListOrganizationId(null), null);
  assert.equal(parseLegalListOrganizationId("abc"), undefined);
  assert.equal(parseLegalListOrganizationId("0"), undefined);
  assert.equal(parseLegalListOrganizationId("1.5"), undefined);
  assert.equal(parseLegalListOrganizationId(" 1"), undefined);
  const personal = legalAcceptancesListScope({
    userId: "user-a",
    organizationId: null,
    orgAccessOk: false,
  });
  assert.equal(personal.ok, true);
  if (!personal.ok) return;
  const rows = [
    { id: 1, organizationId: 1, userId: "user-a" },
    { id: 2, organizationId: 2, userId: "user-a" },
    { id: 3, organizationId: null, userId: "user-a" },
    { id: 4, organizationId: null, userId: "user-b" },
  ];
  assert.deepEqual(
    filterLegalAcceptancesForScope(rows, personal.scope).map((row) => row.id),
    [3],
  );
  const route = readFileSync("src/app/api/legal/accept/route.ts", "utf8");
  assert.match(route, /legalAcceptancesWhere\(scoped\.scope\)/);
  assert.match(route, /requireOrganizationCapability\(organizationId, "manage_legal"\)/);
  assert.doesNotMatch(
    route,
    /organizationId\s*\?\s*eq\(legalAcceptances\.organizationId, organizationId\)\s*:\s*eq\(legalAcceptances\.userId, u\.id\)/,
  );
});

test("a denied central organization access result keeps legal list scope closed", () => {
  const denied = legalAcceptancesListScope({
    userId: "user-a",
    organizationId: 9,
    orgAccessOk: false,
  });
  assert.deepEqual(denied, { ok: false, status: 403 });
  const route = readFileSync("src/app/api/legal/accept/route.ts", "utf8");
  assert.match(route, /organizationId === undefined[\s\S]*INVALID_ORGANIZATION_ID/);
  const card = readFileSync("src/components/vendor/signed-documents-card.tsx", "utf8");
  assert.match(card, /params\.set\("organizationId", String\(organizationId\)\)/);
  const settings = readFileSync(
    "src/app/[locale]/(vendor)/dashboard/locatii/[venueId]/setari/page.tsx",
    "utf8",
  );
  assert.match(settings, /organizationId=\{scoped\.organizationId\}/);
  const request = readFileSync("src/app/api/reviews/request/route.ts", "utf8");
  assert.doesNotMatch(request, /venueOwner:\s*venues\.userId/);
});
