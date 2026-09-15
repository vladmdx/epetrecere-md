import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hallReviewIssues } from "../src/lib/partner/hall-review";
import { registrationDecisionSchema } from "../src/lib/validation/vendor-profile";

const source = (path: string) => readFileSync(path, "utf8");

test("a new room needs its own photo, name and valid capacity; the imported room may inherit venue photos", () => {
  const complete = {
    nameRo: "Grand", slug: "grand", capacityMin: 20, capacityMax: 200,
    isLegacyDefault: false, photoCount: 1,
  };
  assert.deepEqual(hallReviewIssues(complete), []);
  assert.deepEqual(hallReviewIssues({ ...complete, photoCount: 0 }), ["imageUrls"]);
  assert.deepEqual(hallReviewIssues({ ...complete, photoCount: 0, isLegacyDefault: true }), []);
  assert.deepEqual(hallReviewIssues({ ...complete, nameRo: "x", capacityMax: 10 }), ["nameRo", "capacityMax"]);
});

test("admin decision accepts only a unique, nonempty, venue-only hall selection", () => {
  assert.equal(registrationDecisionSchema.safeParse({ id: 2, type: "venue", action: "approve", hallIds: [4, 5] }).success, true);
  assert.equal(registrationDecisionSchema.safeParse({ id: 2, type: "venue", action: "approve", hallIds: [] }).success, false);
  assert.equal(registrationDecisionSchema.safeParse({ id: 2, type: "venue", action: "reject", hallIds: [4, 4] }).success, false);
  assert.equal(registrationDecisionSchema.safeParse({ id: 2, type: "artist", action: "approve", hallIds: [4] }).success, false);
  assert.equal(registrationDecisionSchema.safeParse({ id: 2, type: "venue", action: "reject", hallIds: [4], reviewReason: "Photo is not of this room" }).success, true);
  assert.equal(registrationDecisionSchema.safeParse({ id: 2, type: "venue", action: "reject", hallIds: [4], reviewReason: "short" }).success, false);
});

test("a hall editor submits only its hall, while the whole-local form can submit eligible halls together", () => {
  const editor = source("src/components/vendor/hall-editor.tsx");
  const route = source("src/app/api/venues/[id]/submit-approval/route.ts");
  const onboarding = source("src/lib/partner/onboarding.ts");
  assert.match(editor, /body: JSON\.stringify\(\{ hallIds: \[id\] \}\)/);
  assert.match(route, /selectedHallSchema\.safeParse/);
  assert.match(route, /submitVenueForApproval\(access\.user\.id, venueId, parsed\?\.data\.hallIds\)/);
  assert.match(onboarding, /skippedHallIds/);
  assert.match(onboarding, /inArray\(venueHalls\.id, transitioningHallIds\)/);
});

test("admin decisions affect only selected pending halls and leave remaining pending work in the queue", () => {
  const decision = source("src/lib/partner/registration-decision.ts");
  const route = source("src/app/api/admin/registration-requests/route.ts");
  const page = source("src/app/[locale]/(admin)/admin/cereri-inregistrare/page.tsx");
  assert.equal((decision.match(/inArray\(venueHalls\.id, reviewedHallIds\)/g) ?? []).length, 2);
  assert.equal((decision.match(/remainingPendingHallCount = current\.halls\.filter/g) ?? []).length, 2);
  assert.match(decision, /keepVenueActive = venue\.isActive && Boolean\(activeHall\)/);
  assert.match(route, /HALL_SELECTION_REQUIRED/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /await loadRequests\(\)/);
  assert.match(page, /rejectionReasons/);
  assert.match(decision, /reviewReason: effectiveReviewReason/);
  assert.match(source("src/components/vendor/hall-editor.tsx"), /Motivul refuzului: \{reviewReason\}/);
  const migration = source("src/lib/db/migrations/manual/0040_hall_review_reason.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS review_reason text/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.venue_halls/);
});
