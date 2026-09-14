import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  clearPendingHallCreateRequest,
  discardPendingHallCreateRequest,
  findVenueCreateRetry,
  HALL_CREATE_STORAGE_KEY,
  hallCreateRequestPayload,
  hasPendingHallCreateRequestSlot,
  newPendingHallCreateRequest,
  newPendingOrganizationCreateRequest,
  normalizeVenueCreateRequestId,
  persistPendingHallCreateRequest,
  persistPendingOrganizationCreateRequest,
  readPendingHallCreateRequest,
  readPendingOrganizationCreateRequest,
  venueOnboardingUrl,
} from "../src/lib/partner/onboarding-create-request";

const HALL_KEY = "33333333-3333-4333-8333-333333333333";
const OTHER_HALL_KEY = "44444444-4444-4444-8444-444444444444";
const ORGANIZATION_KEY = "55555555-5555-4555-8555-555555555555";
const ACTOR_A = "user_actor_a";
const ACTOR_B = "user_actor_b";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe("venue onboarding create-request lifecycle", () => {
  test("normalizes an accepted UUID for PostgreSQL round trips", () => {
    assert.equal(
      normalizeVenueCreateRequestId("A0EBC785-9F34-4D01-A2D0-A235F332B1C4"),
      "a0ebc785-9f34-4d01-a2d0-a235f332b1c4",
    );
    assert.equal(normalizeVenueCreateRequestId("not-a-uuid"), null);
  });

  test("freezes a Hall POST payload in an actor-and-venue scoped slot", () => {
    const storage = memoryStorage();
    const body = {
      nameRo: "Sala Imperial",
      nameRu: null,
      capacityMin: 20,
      capacityMax: 160,
      pricingModel: "minimum_order",
      imageUrls: ["https://example.test/hall.jpg"],
      seating: [{ type: "banquet", capacityMin: 20, capacityMax: 140 }],
    };
    const request = newPendingHallCreateRequest(ACTOR_A, 17, HALL_KEY, body);
    assert.ok(request);
    body.imageUrls.push("https://example.test/later.jpg");
    body.seating[0]!.capacityMax = 999;
    assert.deepEqual(hallCreateRequestPayload(request), {
      nameRo: "Sala Imperial",
      nameRu: null,
      capacityMin: 20,
      capacityMax: 160,
      pricingModel: "minimum_order",
      imageUrls: ["https://example.test/hall.jpg"],
      seating: [{ type: "banquet", capacityMin: 20, capacityMax: 140 }],
      hallCreateRequestId: HALL_KEY,
    });
    const outbound = hallCreateRequestPayload(request);
    assert.notEqual(outbound, request.payload);
    assert.equal(Object.isFrozen(outbound), true);
    assert.equal(Object.isFrozen(outbound.imageUrls), true);
    assert.throws(() => {
      (outbound.imageUrls as string[]).push("https://example.test/mutated.jpg");
    });
    assert.deepEqual(hallCreateRequestPayload(request), outbound);
    assert.equal(persistPendingHallCreateRequest(storage, request), true);
    assert.deepEqual(readPendingHallCreateRequest(storage, ACTOR_A, 17), request);
    assert.equal(readPendingHallCreateRequest(storage, ACTOR_B, 17), null);
    assert.equal(readPendingHallCreateRequest(storage, ACTOR_A, 18), null);
  });

  test("never overwrites an unresolved Hall slot with changed data or another UUID", () => {
    const storage = memoryStorage();
    const original = newPendingHallCreateRequest(ACTOR_A, 17, HALL_KEY, {
      nameRo: "Sala originală",
      capacityMax: 100,
    });
    const changedSameKey = newPendingHallCreateRequest(ACTOR_A, 17, HALL_KEY, {
      nameRo: "Sala modificată",
      capacityMax: 120,
    });
    const changedKey = newPendingHallCreateRequest(ACTOR_A, 17, OTHER_HALL_KEY, {
      nameRo: "Altă sală",
      capacityMax: 120,
    });
    assert.ok(original);
    assert.ok(changedSameKey);
    assert.ok(changedKey);
    assert.equal(persistPendingHallCreateRequest(storage, original), true);
    assert.equal(persistPendingHallCreateRequest(storage, original), true);
    assert.equal(persistPendingHallCreateRequest(storage, changedSameKey), false);
    assert.equal(persistPendingHallCreateRequest(storage, changedKey), false);
    assert.deepEqual(readPendingHallCreateRequest(storage, ACTOR_A, 17), original);
  });

  test("Hall clear is request-exact while explicit discard removes the scoped slot", () => {
    const storage = memoryStorage();
    const request = newPendingHallCreateRequest(ACTOR_A, 17, HALL_KEY, {
      nameRo: "Sala de reluat",
    });
    assert.ok(request);
    assert.equal(persistPendingHallCreateRequest(storage, request), true);
    assert.equal(
      clearPendingHallCreateRequest(storage, ACTOR_A, 17, OTHER_HALL_KEY),
      false,
    );
    assert.deepEqual(readPendingHallCreateRequest(storage, ACTOR_A, 17), request);
    assert.equal(clearPendingHallCreateRequest(storage, ACTOR_B, 17, HALL_KEY), false);
    assert.equal(clearPendingHallCreateRequest(storage, ACTOR_A, 17, HALL_KEY), true);
    assert.equal(readPendingHallCreateRequest(storage, ACTOR_A, 17), null);
    assert.equal(persistPendingHallCreateRequest(storage, request), true);
    assert.equal(discardPendingHallCreateRequest(storage, ACTOR_A, 17), true);
    assert.equal(readPendingHallCreateRequest(storage, ACTOR_A, 17), null);
  });

  test("Hall clear fails closed when storage ignores removeItem", () => {
    const backing = memoryStorage();
    const request = newPendingHallCreateRequest(ACTOR_A, 17, HALL_KEY, {
      nameRo: "Sala încă în așteptare",
    });
    assert.ok(request);
    assert.equal(persistPendingHallCreateRequest(backing, request), true);
    assert.equal(clearPendingHallCreateRequest({
      getItem: backing.getItem,
      setItem: backing.setItem,
      removeItem: () => undefined,
    }, ACTOR_A, 17, HALL_KEY), false);
    assert.deepEqual(readPendingHallCreateRequest(backing, ACTOR_A, 17), request);
  });

  test("refuses Hall persistence when browser storage is unavailable", () => {
    const request = newPendingHallCreateRequest(ACTOR_A, 17, HALL_KEY, {
      nameRo: "Sala fără storage",
    });
    assert.ok(request);
    assert.equal(persistPendingHallCreateRequest({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage disabled");
      },
      removeItem: () => undefined,
    }, request), false);
    assert.equal(hasPendingHallCreateRequestSlot({
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    }, ACTOR_A, 17), true);
  });

  test("reports and explicitly discards a corrupt Hall slot without overwriting it", () => {
    const storage = memoryStorage();
    storage.setItem(
      `${HALL_CREATE_STORAGE_KEY}:${encodeURIComponent(ACTOR_A)}:17`,
      "{not-json",
    );
    const request = newPendingHallCreateRequest(ACTOR_A, 17, HALL_KEY, {
      nameRo: "Sala nouă",
    });
    assert.ok(request);
    assert.equal(hasPendingHallCreateRequestSlot(storage, ACTOR_A, 17), true);
    assert.equal(readPendingHallCreateRequest(storage, ACTOR_A, 17), null);
    assert.equal(persistPendingHallCreateRequest(storage, request), false);
    assert.equal(discardPendingHallCreateRequest(storage, ACTOR_A, 17), true);
    assert.equal(hasPendingHallCreateRequestSlot(storage, ACTOR_A, 17), false);
  });

  test("organization payload is immutable even when a caller reuses the same UUID", () => {
    const storage = memoryStorage();
    const original = newPendingOrganizationCreateRequest(
      "Organizația originală",
      ORGANIZATION_KEY,
      ACTOR_A,
    );
    const changed = newPendingOrganizationCreateRequest(
      "Organizația modificată",
      ORGANIZATION_KEY,
      ACTOR_A,
    );
    assert.ok(original);
    assert.ok(changed);
    assert.equal(persistPendingOrganizationCreateRequest(storage, original), true);
    assert.equal(persistPendingOrganizationCreateRequest(storage, changed), false);
    assert.deepEqual(readPendingOrganizationCreateRequest(storage, ACTOR_A), original);
  });

  test("recovers only the venue carrying the same organization-scoped key", () => {
    const key = "a0ebc785-9f34-4d01-a2d0-a235f332b1c4";
    const organizationVenues = [
      { id: 11, onboardingSubmissionId: null },
      { id: 12, onboardingSubmissionId: key },
    ];
    const otherOrganizationVenues = [{ id: 21, onboardingSubmissionId: key }];

    assert.equal(findVenueCreateRetry(organizationVenues, key)?.id, 12);
    assert.equal(findVenueCreateRetry(otherOrganizationVenues, null), null);
  });

  test("keeps RU/EN prefixes while adding and removing create intent", () => {
    const createParams = new URLSearchParams({
      organizationId: "7",
      intent: "create",
      createRequestId: "a0ebc785-9f34-4d01-a2d0-a235f332b1c4",
    });
    assert.equal(
      venueOnboardingUrl("ru", createParams),
      "/ru/dashboard/venue-onboarding?organizationId=7&intent=create&createRequestId=a0ebc785-9f34-4d01-a2d0-a235f332b1c4",
    );

    const recoveredParams = new URLSearchParams({ organizationId: "7", venueId: "12" });
    assert.equal(
      venueOnboardingUrl("en", recoveredParams),
      "/en/dashboard/venue-onboarding?organizationId=7&venueId=12",
    );
    assert.equal(venueOnboardingUrl("ro", recoveredParams), "/dashboard/venue-onboarding?organizationId=7&venueId=12");
  });
});
