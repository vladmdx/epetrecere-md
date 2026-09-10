import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { z } from "zod/v4";
import { artistLocationUpdate, artistTravelShape, registrationDecisionSchema, venueOwnerFields } from "../src/lib/validation/vendor-profile";
import { ALL_EVENT_TYPES } from "../src/lib/events/normalize";
import { normalizeArtistEventTypes } from "../src/lib/events/artist-event-types";

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

test("partner event types are canonical, ordered and backward compatible", () => {
  assert.deepEqual(normalizeArtistEventTypes(null), ALL_EVENT_TYPES);
  assert.deepEqual(
    normalizeArtistEventTypes(["concert", "wedding", "concert", "invalid"]),
    ["wedding", "concert"],
  );
  assert.deepEqual(normalizeArtistEventTypes([], false), []);
});

test("a duplicate onboarding phone returns to the editable field instead of trapping a signed request", () => {
  const artist = readFileSync("src/app/[locale]/(vendor)/dashboard/onboarding/page.tsx", "utf8");
  const venue = readFileSync("src/app/[locale]/(vendor)/dashboard/venue-onboarding/page.tsx", "utf8");
  const artistRoute = readFileSync("src/app/api/auth/register-artist/route.ts", "utf8");
  const venueRoute = readFileSync("src/app/api/auth/register-venue/route.ts", "utf8");

  assert.match(artist, /phone: data\.phone/);
  assert.match(artist, /err\.code === "phone_in_use"[\s\S]*setStep\(1\)/);
  assert.match(artist, /ref=\{phoneInputRef\}/);
  assert.match(venue, /err\.code === "phone_in_use"[\s\S]*setStep\(0\)/);
  assert.match(venue, /ref=\{phoneInputRef\}/);
  assert.match(artistRoute, /code: "phone_in_use"/);
  assert.match(venueRoute, /code: "phone_in_use"/);
});
