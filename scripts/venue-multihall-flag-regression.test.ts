/**
 * FEATURE_MULTI_HALL kill switch: flag OFF keeps legacy sala/onboarding,
 * and the central mutation gate returns FEATURE_DISABLED.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isMultiHallEnabled } from "../src/lib/feature-flags";
import {
  jsonIfMultiHallDisabled,
  MULTI_HALL_DISABLED_CODE,
  multiHallMutationsAllowed,
  salaUsesLegacyLayout,
} from "../src/lib/partner/multi-hall-gate";
import { publicVenueReservationScope } from "../src/lib/booking/venue-booking-write";
import { organizationWriteCapability } from "../src/lib/partner/organization-write";

function withFlag(on: boolean, fn: () => Promise<void> | void) {
  const previous = process.env.FEATURE_MULTI_HALL;
  if (on) process.env.FEATURE_MULTI_HALL = "1";
  else delete process.env.FEATURE_MULTI_HALL;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) delete process.env.FEATURE_MULTI_HALL;
      else process.env.FEATURE_MULTI_HALL = previous;
    });
}

test("flag OFF: legacy sala layout, mutations gated", async () => {
  await withFlag(false, async () => {
    assert.equal(isMultiHallEnabled(), false);
    assert.equal(multiHallMutationsAllowed(), false);
    assert.equal(salaUsesLegacyLayout(), true);
    const response = jsonIfMultiHallDisabled();
    assert.ok(response);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.code, MULTI_HALL_DISABLED_CODE);
    assert.equal(body.error, "FEATURE_DISABLED");
  });
});

test("flag ON: locatii layout, mutations allowed", async () => {
  await withFlag(true, async () => {
    assert.equal(isMultiHallEnabled(), true);
    assert.equal(multiHallMutationsAllowed(), true);
    assert.equal(salaUsesLegacyLayout(), false);
    assert.equal(jsonIfMultiHallDisabled(), null);
  });
});

test("public payload cannot set reservationScope=venue", async () => {
  await withFlag(true, () => {
    const rejected = publicVenueReservationScope({ hallId: 1, reservationScope: "venue" });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, "PUBLIC_VENUE_SCOPE_FORBIDDEN");
      assert.equal(rejected.status, 400);
    }
    const missingHall = publicVenueReservationScope({ reservationScope: "hall" });
    assert.equal(missingHall.ok, false);
    if (!missingHall.ok) assert.equal(missingHall.code, "HALL_REQUIRED");
    const hall = publicVenueReservationScope({ hallId: 9, reservationScope: "hall" });
    assert.equal(hall.ok, true);
    if (hall.ok) {
      assert.equal(hall.reservationScope, "hall");
      assert.equal(hall.hallId, 9);
    }
  });
});

test("organization patch capability uses field presence, not truthiness", () => {
  assert.equal(organizationWriteCapability({ legalName: "" }), "manage_legal");
  assert.equal(organizationWriteCapability({ idNumber: "" }), "manage_legal");
  assert.equal(organizationWriteCapability({ type: "company" }), "manage_legal");
  assert.equal(organizationWriteCapability({ billingEmail: "" }), "manage_billing");
  assert.equal(organizationWriteCapability({ displayName: "Org" }), "manage_venues");
});
