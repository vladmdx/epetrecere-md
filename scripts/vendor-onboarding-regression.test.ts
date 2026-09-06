import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod/v4";
import { artistLocationUpdate, artistTravelShape, registrationDecisionSchema, venueOwnerFields } from "../src/lib/validation/vendor-profile";

test("onboarding retains a non-Chisinau base, travel allowance, surcharge and hidden pricing", () => {
  const submitted = { baseCity: "Bălți", travelDistanceKm: 90, travelSurchargeEnabled: true, travelSurchargeAmount: 75, priceHidden: true };
  const parsed = z.object(artistTravelShape).parse(submitted);
  assert.deepEqual(parsed, submitted);
  assert.deepEqual(artistLocationUpdate(parsed), { baseCity: "Bălți", location: "Bălți" });
  for (const invalid of [{ travelDistanceKm: -1 }, { travelDistanceKm: 1000 }, { travelDistanceKm: 50.5 }, { travelSurchargeAmount: -2 }, { travelSurchargeAmount: 25.5 }]) {
    assert.equal(z.object(artistTravelShape).safeParse({ ...submitted, ...invalid }).success, false);
  }
});

test("profile editor and settings changes keep both city fields synchronized", () => {
  assert.deepEqual(artistLocationUpdate({ location: " Orhei " }), { baseCity: "Orhei", location: "Orhei" });
  assert.deepEqual(artistLocationUpdate({ baseCity: "Бельцы", location: "Chișinău" }), { baseCity: "Bălți", location: "Bălți" });
  assert.deepEqual(artistLocationUpdate({}), {});
});

test("venue owners cannot publish or feature their own unapproved profile", () => {
  const fields = { nameRo: "Sala nouă", isActive: true, isFeatured: true };
  assert.deepEqual(venueOwnerFields(fields, false), { nameRo: "Sala nouă" });
  assert.deepEqual(venueOwnerFields(fields, true), fields);
  assert.equal(fields.isActive, true, "sanitizing a request must not mutate its source");
});

test("unknown admin action cannot fall through into destructive rejection", () => {
  assert.equal(registrationDecisionSchema.safeParse({ id: 12, type: "venue", action: "approve" }).success, true);
  for (const invalid of [{ action: "approved" }, { action: "" }, { type: "anything" }, { id: -1 }, { id: 1.5 }]) {
    assert.equal(registrationDecisionSchema.safeParse({ id: 12, type: "artist", action: "approve", ...invalid }).success, false);
  }
});
