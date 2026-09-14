import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const client = readFileSync(
  "src/app/[locale]/(vendor)/dashboard/venue-onboarding/multi-hall-client.tsx",
  "utf8",
);
const venueRoute = readFileSync(
  "src/app/api/organizations/[id]/venues/route.ts",
  "utf8",
);
const onboardingRoute = readFileSync(
  "src/app/api/partner/onboarding/route.ts",
  "utf8",
);
const onboardingService = readFileSync(
  "src/lib/partner/onboarding.ts",
  "utf8",
);
const agreementHook = readFileSync(
  "src/hooks/use-onboarding-agreement.ts",
  "utf8",
);

function section(start: string, end: string): string {
  const from = client.indexOf(start);
  const to = client.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing section start: ${start}`);
  assert.ok(to > from, `missing section end: ${end}`);
  return client.slice(from, to);
}

describe("multi-hall onboarding create recovery source", () => {
  test("Venue create freezes payload before history and POST", () => {
    const saveVenue = section("async function saveVenue", "async function saveHall");
    assert.match(saveVenue, /readPendingVenueCreateRequest/);
    assert.match(saveVenue, /newPendingVenueCreateRequest/);
    assert.match(saveVenue, /venueCreateRequestPayload\(createRequest\)/);
    assert.match(saveVenue, /clearPendingVenueCreateRequest/);
    assert.ok(
      saveVenue.indexOf("persistPendingVenueCreateRequest")
        < saveVenue.indexOf("window.history.replaceState"),
    );
    assert.ok(
      saveVenue.indexOf("window.history.replaceState")
        < saveVenue.indexOf("const res = await fetch"),
    );
    assert.ok(
      saveVenue.indexOf("crypto.randomUUID()")
        > saveVenue.indexOf("async function saveVenue"),
      "a Venue UUID must not be emitted before its exact payload exists",
    );
    assert.match(client, /venueCreateRecoveryOnly/);
    assert.match(client, /discardPendingVenueCreateRequest/);
    assert.match(client, /fieldset[\s\S]+hasPendingVenueCreate[\s\S]+venueCreateRecoveryOnly/);
    assert.match(saveVenue, /if \(!venueId\) \{/,
      "every Venue POST, including a zero-venue organization resume, must use durable create identity");
    assert.match(saveVenue, /venueCreatePayloadFromForm\(venue, venueImagesDirty\)/,
      "unchanged galleries must be omitted from an update/attachment");
  });

  test("embedded Hall create uses the same exact replay order", () => {
    const saveHall = section("async function saveHall", "async function next");
    assert.match(saveHall, /readPendingHallCreateRequest/);
    assert.match(saveHall, /newPendingHallCreateRequest/);
    assert.match(saveHall, /hallCreateRequestPayload\(createRequest\)/);
    assert.match(saveHall, /clearPendingHallCreateRequest/);
    assert.ok(
      saveHall.indexOf("persistPendingHallCreateRequest")
        < saveHall.indexOf("window.history.replaceState"),
    );
    assert.ok(
      saveHall.indexOf("window.history.replaceState")
        < saveHall.indexOf("const res = await fetch"),
    );
    assert.match(client, /hallCreateRecoveryOnly/);
    assert.match(client, /discardPendingHallCreateRequest/);
  });

  test("recovery is actor-scoped and committed rows clear only exact slots", () => {
    assert.match(client, /actorRef\.current !== actorId/);
    assert.match(client, /resolvedVenueCreateIdentity !== venueCreateIdentity/);
    assert.match(client, /resolvedHallCreateIdentity !== hallCreateIdentity/);
    assert.match(client, /onboardingRecoveryEpochRef\.current !== recoveryEpoch/);
    assert.match(client, /function discardPendingVenueCreate\(\)[\s\S]+onboardingRecoveryEpochRef\.current \+= 1/);
    assert.match(client, /function discardPendingHallCreate\(\)[\s\S]+onboardingRecoveryEpochRef\.current \+= 1/);
    assert.match(client, /resolution\.recoveredVenue[\s\S]+clearPendingVenueCreateRequest/);
    assert.match(client, /candidate\.creationRequestId\.toLowerCase\(\) === hallCreateRequestId/);
    assert.match(client, /clearPendingHallCreateRequest\([\s\S]+selectedVenue\.id/);
    assert.match(client, /activeOnboardingScopeRef\.current === token\.identity/);
    assert.match(client, /onboardingRecoveryEpochRef\.current === token\.epoch/);
    assert.match(client, /if \(!clearPendingVenueCreateRequest\(/);
    assert.match(client, /if \(!clearPendingHallCreateRequest\(/);
  });

  test("venue save returns authoritative Hall status after commit", () => {
    assert.match(venueRoute, /await saveVenueDraft/);
    assert.match(venueRoute, /select\(\{ id: venueHalls\.id, status: venueHalls\.status \}\)/);
    assert.ok(
      venueRoute.indexOf("await saveVenueDraft") < venueRoute.indexOf("const halls = await db"),
    );
    assert.match(client, /authoritativeHall/);
    assert.match(client, /setHallStatus\(authoritativeHall\.status\)/);
  });

  test("new and rejected venues can provide required venue-level photos", () => {
    assert.match(client, /formData\.append\("folder", "venues"\)/);
    assert.match(client, /image\.hallId == null/);
    assert.match(client, /imageUrls: \[\.\.\.form\.imageUrls\]/);
    assert.match(client, /minimum una, maximum 10/);
    assert.match(client, /uploadingVenueImages/);
  });

  test("existing Venue galleries keep canonical order and unchanged metadata", () => {
    assert.match(onboardingRoute, /orderBy\([\s\S]+venueImages\.isCover[\s\S]+venueImages\.sortOrder[\s\S]+venueImages\.id/);
    assert.match(client, /setVenueImagesDirty\(true\)/);
    assert.match(onboardingService, /Reconcile by URL instead of deleting the complete gallery/);
    assert.match(onboardingService, /retainedIds\.push\(retained\.id\)/);
    assert.match(onboardingService, /set\(\{ sortOrder, isCover:/);
  });

  test("organization and legal state are isolated across same-actor navigation", () => {
    assert.match(client, /activeOnboardingScopeRef/);
    assert.match(client, /setSignature\(null\)[\s\S]+\}, \[organizationId\]\)/);
    assert.match(client, /key=\{`\$\{resolvedActorId \?\? "no-actor"\}:\$\{organizationId \?\? "no-organization"\}`\}/);
    assert.match(agreementHook, /const scopeKey = accountId[\s\S]+organizationId \?\? "personal"/);
    assert.match(agreementHook, /remote\.scopeKey === scopeKey/);
  });

  test("Edit to Add navigation clears Venue and Hall forms before recovery", () => {
    assert.match(client, /The App Router can reuse this component when only the query changes/);
    assert.match(client, /setVenue\(\{ \.\.\.EMPTY_VENUE_FORM \}\)/);
    assert.match(client, /setVenueImagesDirty\(false\)/);
    assert.match(client, /setHall\(\{ \.\.\.EMPTY_HALL_FORM \}\)/);
  });
});
