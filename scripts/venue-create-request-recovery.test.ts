import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  clearPendingVenueCreateRequest,
  discardPendingVenueCreateRequest,
  hasPendingVenueCreateRequestSlot,
  newPendingVenueCreateRequest,
  persistPendingVenueCreateRequest,
  readPendingVenueCreateRequest,
  venueCreateRequestPayload,
  VENUE_CREATE_STORAGE_KEY,
} from "../src/lib/partner/venue-create-request";

const REQUEST_ID = "a0ebc785-9f34-4d01-a2d0-a235f332b1c4";
const OTHER_ID = "b0ebc785-9f34-4d01-a2d0-a235f332b1c4";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("venue create request recovery", () => {
  test("freezes the exact body in an actor-and-organization scoped slot", () => {
    const body = {
      name: "Imperial",
      phone: "+37369000123",
      city: "Chișinău",
      address: "str. Test 1",
      imageUrls: ["https://example.test/cover.jpg"],
    };
    const request = newPendingVenueCreateRequest("actor-a", 7, REQUEST_ID, body);
    assert.ok(request);
    body.imageUrls.push("https://example.test/later.jpg");
    const outbound = venueCreateRequestPayload(request);
    assert.deepEqual(outbound, {
      name: "Imperial",
      phone: "+37369000123",
      city: "Chișinău",
      address: "str. Test 1",
      imageUrls: ["https://example.test/cover.jpg"],
      organizationId: 7,
      createIntent: true,
      createRequestId: REQUEST_ID,
    });
    assert.equal(Object.isFrozen(request.payload), true);
    assert.equal(Object.isFrozen(request.payload.imageUrls), true);
    assert.equal(Object.isFrozen(outbound), true);
    assert.equal(Object.isFrozen(outbound.imageUrls), true);
    const storage = memoryStorage();
    assert.equal(persistPendingVenueCreateRequest(storage, request), true);
    assert.deepEqual(readPendingVenueCreateRequest(storage, "actor-a", 7), request);
    assert.equal(readPendingVenueCreateRequest(storage, "actor-b", 7), null);
    assert.equal(readPendingVenueCreateRequest(storage, "actor-a", 8), null);
  });

  test("never overwrites an unresolved slot and clears only its exact key", () => {
    const storage = memoryStorage();
    const original = newPendingVenueCreateRequest("actor-a", 7, REQUEST_ID, {
      name: "Original",
    });
    const changed = newPendingVenueCreateRequest("actor-a", 7, REQUEST_ID, {
      name: "Changed",
    });
    const another = newPendingVenueCreateRequest("actor-a", 7, OTHER_ID, {
      name: "Another",
    });
    assert.ok(original);
    assert.ok(changed);
    assert.ok(another);
    assert.equal(persistPendingVenueCreateRequest(storage, original), true);
    assert.equal(persistPendingVenueCreateRequest(storage, changed), false);
    assert.equal(persistPendingVenueCreateRequest(storage, another), false);
    assert.equal(clearPendingVenueCreateRequest(storage, "actor-a", 7, OTHER_ID), false);
    assert.deepEqual(readPendingVenueCreateRequest(storage, "actor-a", 7), original);
    assert.equal(clearPendingVenueCreateRequest(storage, "actor-a", 7, REQUEST_ID), true);
    assert.equal(readPendingVenueCreateRequest(storage, "actor-a", 7), null);
  });

  test("storage failure prevents POST eligibility and discard is scope-exact", () => {
    const request = newPendingVenueCreateRequest("actor-a", 7, REQUEST_ID, {
      name: "No storage",
    });
    assert.ok(request);
    assert.equal(persistPendingVenueCreateRequest({
      getItem: () => null,
      setItem: () => { throw new Error("disabled"); },
      removeItem: () => undefined,
    }, request), false);

    const storage = memoryStorage();
    assert.equal(persistPendingVenueCreateRequest(storage, request), true);
    assert.equal(discardPendingVenueCreateRequest(storage, "actor-b", 7), true);
    assert.deepEqual(readPendingVenueCreateRequest(storage, "actor-a", 7), request);
    assert.equal(discardPendingVenueCreateRequest(storage, "actor-a", 7), true);
    assert.equal(readPendingVenueCreateRequest(storage, "actor-a", 7), null);
  });

  test("rejects a payload that could smuggle update identity into create", () => {
    assert.equal(newPendingVenueCreateRequest("actor-a", 7, REQUEST_ID, {
      venueId: 99,
      name: "Unsafe",
    }), null);
  });

  test("a storage backend that ignores removal cannot report a committed clear", () => {
    const backing = memoryStorage();
    const request = newPendingVenueCreateRequest("actor-a", 7, REQUEST_ID, {
      name: "Still pending",
    });
    assert.ok(request);
    assert.equal(persistPendingVenueCreateRequest(backing, request), true);
    const noOpRemove = {
      getItem: backing.getItem,
      setItem: backing.setItem,
      removeItem: () => undefined,
    };
    assert.equal(
      clearPendingVenueCreateRequest(noOpRemove, "actor-a", 7, REQUEST_ID),
      false,
    );
    assert.deepEqual(readPendingVenueCreateRequest(backing, "actor-a", 7), request);
  });

  test("treats a corrupt or unreadable slot as occupied until explicit discard", () => {
    const storage = memoryStorage();
    storage.setItem(`${VENUE_CREATE_STORAGE_KEY}:actor-a:7`, "{broken");
    assert.equal(hasPendingVenueCreateRequestSlot(storage, "actor-a", 7), true);
    assert.equal(readPendingVenueCreateRequest(storage, "actor-a", 7), null);
    assert.equal(discardPendingVenueCreateRequest(storage, "actor-a", 7), true);
    assert.equal(hasPendingVenueCreateRequestSlot(storage, "actor-a", 7), false);

    assert.equal(hasPendingVenueCreateRequestSlot({
      getItem: () => { throw new Error("unavailable"); },
      setItem: () => undefined,
      removeItem: () => undefined,
    }, "actor-a", 7), true);
  });
});
