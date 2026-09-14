import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  BOOKING_CREATE_STORAGE_PREFIX,
  BookingCreateHallConflictError,
  BookingCreatePersistenceError,
  bookingCreateScope,
  isAmbiguousBookingCreateStatus,
  newPendingBookingCreateRequest,
  readPendingBookingCreateRequest,
  submitBookingCreateRequest,
} from "../src/lib/booking/booking-create-client";
import {
  clearPendingJsonRequest,
  pendingJsonRequestStorageKey,
  preparePendingJsonRequest,
} from "../packages/shared/src/api/pending-json-request";
import { createApiClient } from "../packages/shared/src/api/index";

const REQUEST_ID = "a0ebc785-9f34-4d01-a2d0-a235f332b1c4";
const OTHER_ID = "b0ebc785-9f34-4d01-a2d0-a235f332b1c4";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("browser booking-create idempotency", () => {
  test("scope separates actor, target and event plan", () => {
    const artist = bookingCreateScope({ actorId: "user-a", artistId: 7, eventPlanId: 9 });
    assert.notEqual(artist, bookingCreateScope({ actorId: "user-b", artistId: 7, eventPlanId: 9 }));
    assert.notEqual(artist, bookingCreateScope({ actorId: "user-a", venueId: 7, eventPlanId: 9 }));
    assert.notEqual(artist, bookingCreateScope({ actorId: "user-a", artistId: 7 }));
    assert.throws(() => bookingCreateScope({ actorId: "user-a", artistId: 7, venueId: 8 }));
    assert.throws(() => bookingCreateScope({ actorId: "user-a" }));
  });

  test("freezes a JSON copy before the first network call", () => {
    const payload = { artistId: 7, details: { date: "2026-10-10" }, ignored: undefined };
    const pending = newPendingBookingCreateRequest("scope", REQUEST_ID, payload);
    assert.ok(pending);
    payload.details.date = "2027-01-01";
    assert.deepEqual(pending.payload, { artistId: 7, details: { date: "2026-10-10" } });
    assert.equal(Object.isFrozen(pending.payload), true);
    assert.equal(Object.isFrozen(pending.payload.details), true);
  });

  test("lost response retries the exact body and Idempotency-Key", async () => {
    const storage = memoryStorage();
    const scope = bookingCreateScope({ actorId: "user-a", artistId: 7 });
    const sent: Array<{ key: string | null; body: string }> = [];
    let attempt = 0;
    const fetcher = (async (_url, init) => {
      const headers = new Headers(init?.headers);
      sent.push({ key: headers.get("Idempotency-Key"), body: String(init?.body) });
      if (++attempt === 1) throw new Error("response lost after commit");
      return new Response(JSON.stringify({ id: 99 }), { status: 200 });
    }) as typeof fetch;

    await assert.rejects(submitBookingCreateRequest({
      scope,
      payload: { artistId: 7, eventDate: "2026-10-10" },
      storage,
      fetcher,
      createRequestId: () => REQUEST_ID,
    }));
    assert.equal(readPendingBookingCreateRequest(storage, scope)?.requestId, REQUEST_ID);

    // Edited UI state cannot mutate an unresolved request: replay sends the
    // body persisted before the lost response.
    const result = await submitBookingCreateRequest({
      scope,
      payload: { artistId: 7, eventDate: "2027-01-01" },
      storage,
      fetcher,
      createRequestId: () => OTHER_ID,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.booking, { id: 99 });
    assert.equal(result.requestId, REQUEST_ID);
    assert.deepEqual(sent, [
      { key: REQUEST_ID, body: JSON.stringify({ artistId: 7, eventDate: "2026-10-10" }) },
      { key: REQUEST_ID, body: JSON.stringify({ artistId: 7, eventDate: "2026-10-10" }) },
    ]);
    assert.equal(readPendingBookingCreateRequest(storage, scope), null);
  });

  test("parallel calls share one HTTP request", async () => {
    const storage = memoryStorage();
    const scope = bookingCreateScope({ actorId: "user-a", venueId: 4, eventPlanId: 2 });
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetcher = (async () => {
      calls += 1;
      await gate;
      return new Response(JSON.stringify({ id: 100 }), { status: 201 });
    }) as typeof fetch;
    const options = {
      scope,
      payload: { venueId: 4, eventPlanId: 2 },
      storage,
      fetcher,
      createRequestId: () => REQUEST_ID,
    };
    const first = submitBookingCreateRequest(options);
    const second = submitBookingCreateRequest(options);
    release();
    const responses = await Promise.all([first, second]);
    assert.equal(calls, 1);
    assert.deepEqual(
      responses.map((result) => result.response.status),
      [201, 201],
    );
    assert.deepEqual(responses.map((result) => result.ok), [true, true]);
  });

  test("ambiguous statuses retain the slot; deterministic 4xx consumes it", async () => {
    assert.equal(isAmbiguousBookingCreateStatus(408), true);
    assert.equal(isAmbiguousBookingCreateStatus(429), true);
    assert.equal(isAmbiguousBookingCreateStatus(503), true);
    assert.equal(isAmbiguousBookingCreateStatus(409), false);
    const storage = memoryStorage();
    const scope = bookingCreateScope({ actorId: "user-a", artistId: 7 });
    await submitBookingCreateRequest({
      scope,
      payload: { artistId: 7 },
      storage,
      fetcher: (async () => new Response("{}", { status: 503 })) as typeof fetch,
      createRequestId: () => REQUEST_ID,
    });
    assert.equal(readPendingBookingCreateRequest(storage, scope)?.requestId, REQUEST_ID);
    await submitBookingCreateRequest({
      scope,
      payload: { artistId: 7 },
      storage,
      fetcher: (async () => new Response("{}", { status: 400 })) as typeof fetch,
      createRequestId: () => OTHER_ID,
    });
    assert.equal(readPendingBookingCreateRequest(storage, scope), null);
    assert.equal(
      [...storage.values.keys()].some((key) => key.startsWith(BOOKING_CREATE_STORAGE_PREFIX)),
      false,
    );
  });

  test("truncated 201 retains the envelope and retry reuses its UUID and body", async () => {
    const storage = memoryStorage();
    const scope = bookingCreateScope({ actorId: "user-a", artistId: 7 });
    const sent: Array<{ key: string | null; body: string }> = [];
    let attempt = 0;
    const fetcher = (async (_url, init) => {
      const headers = new Headers(init?.headers);
      sent.push({ key: headers.get("Idempotency-Key"), body: String(init?.body) });
      if (++attempt === 1) {
        return new Response('{"id":', {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: 101 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await assert.rejects(
      submitBookingCreateRequest({
        scope,
        payload: { artistId: 7, eventDate: "2026-10-10" },
        storage,
        fetcher,
        createRequestId: () => REQUEST_ID,
      }),
      { code: "BOOKING_CREATE_INVALID_SUCCESS" },
    );
    assert.equal(readPendingBookingCreateRequest(storage, scope)?.requestId, REQUEST_ID);

    const retried = await submitBookingCreateRequest({
      scope,
      payload: { artistId: 7, eventDate: "2027-01-01" },
      storage,
      fetcher,
      createRequestId: () => OTHER_ID,
    });
    assert.equal(retried.ok, true);
    assert.deepEqual(sent, [
      { key: REQUEST_ID, body: JSON.stringify({ artistId: 7, eventDate: "2026-10-10" }) },
      { key: REQUEST_ID, body: JSON.stringify({ artistId: 7, eventDate: "2026-10-10" }) },
    ]);
    assert.equal(readPendingBookingCreateRequest(storage, scope), null);
  });

  test("2xx with an invalid booking id is not acknowledged", async () => {
    const storage = memoryStorage();
    const scope = bookingCreateScope({ actorId: "user-a", venueId: 4 });
    await assert.rejects(
      submitBookingCreateRequest({
        scope,
        payload: { venueId: 4 },
        storage,
        fetcher: (async () => new Response(JSON.stringify({ id: 0 }), {
          status: 201,
        })) as typeof fetch,
        createRequestId: () => REQUEST_ID,
      }),
      { code: "BOOKING_CREATE_INVALID_SUCCESS" },
    );
    assert.equal(readPendingBookingCreateRequest(storage, scope)?.requestId, REQUEST_ID);
  });

  test("failed compare-and-clear never acknowledges deterministic failure or success", async () => {
    const storage = memoryStorage();
    const scope = bookingCreateScope({ actorId: "user-a", artistId: 7 });
    let removalWorks = false;
    const unreliableStorage = {
      ...storage,
      removeItem: (key: string) => {
        if (removalWorks) storage.removeItem(key);
      },
    };

    await assert.rejects(
      submitBookingCreateRequest({
        scope,
        payload: { artistId: 7, eventDate: "2026-10-10" },
        storage: unreliableStorage,
        fetcher: (async () => new Response("{}", { status: 400 })) as typeof fetch,
        createRequestId: () => REQUEST_ID,
      }),
      BookingCreatePersistenceError,
    );
    assert.equal(readPendingBookingCreateRequest(storage, scope)?.requestId, REQUEST_ID);

    await assert.rejects(
      submitBookingCreateRequest({
        scope,
        payload: { artistId: 7, eventDate: "2027-01-01" },
        storage: unreliableStorage,
        fetcher: (async () => new Response(JSON.stringify({ id: 111 }), {
          status: 200,
        })) as typeof fetch,
        createRequestId: () => OTHER_ID,
      }),
      BookingCreatePersistenceError,
    );
    assert.equal(readPendingBookingCreateRequest(storage, scope)?.requestId, REQUEST_ID);

    removalWorks = true;
    const retry = await submitBookingCreateRequest({
      scope,
      payload: { artistId: 7, eventDate: "2028-01-01" },
      storage: unreliableStorage,
      fetcher: (async () => new Response(JSON.stringify({ id: 111 }), {
        status: 200,
      })) as typeof fetch,
      createRequestId: () => OTHER_ID,
    });
    assert.equal(retry.ok, true);
    assert.equal(retry.requestId, REQUEST_ID);
    assert.equal(readPendingBookingCreateRequest(storage, scope), null);
  });
});

test("shared async envelope serializes mobile preparation and clears request-exact", async () => {
  const storage = memoryStorage();
  const scope = JSON.stringify(["v1", "mobile-user", "artist", 8, null]);
  const storageKey = pendingJsonRequestStorageKey("epetrecere:booking-create:v1", scope);
  let generated = 0;
  const prepare = () => preparePendingJsonRequest({
    storage,
    storageKey,
    scope,
    payload: { artistId: 8, eventDate: "2026-11-11" },
    createRequestId: () => (++generated === 1 ? REQUEST_ID : OTHER_ID),
  });
  const [first, second] = await Promise.all([prepare(), prepare()]);
  assert.equal(generated, 1);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first.payload), true);
  assert.equal(await clearPendingJsonRequest({
    storage,
    storageKey,
    scope,
    requestId: OTHER_ID,
  }), false);
  assert.equal(await clearPendingJsonRequest({
    storage,
    storageKey,
    scope,
    requestId: REQUEST_ID,
  }), true);
});

test("shared API client forwards Idempotency-Key without allowing auth override", async () => {
  const originalFetch = globalThis.fetch;
  let received: Headers | null = null;
  globalThis.fetch = (async (_input, init) => {
    received = new Headers(init?.headers);
    return new Response(JSON.stringify({ id: 1 }), { status: 201 });
  }) as typeof fetch;
  try {
    const api = createApiClient({
      baseUrl: "https://example.test/api/v1",
      getToken: async () => "trusted-token",
    });
    const response = await api.post("/booking-requests", { artistId: 8 }, {
      headers: {
        "Idempotency-Key": REQUEST_ID,
        Authorization: "untrusted-token",
      },
    });
    assert.equal(response.status, 201);
    assert.equal((received as Headers | null)?.get("Idempotency-Key"), REQUEST_ID);
    assert.equal((received as Headers | null)?.get("Authorization"), "Bearer trusted-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

describe("browser booking-create hall lock", () => {
  test("Hall A retry keeps the same key and Hall A until resolved", async () => {
    const storage = memoryStorage();
    const scope = bookingCreateScope({ actorId: "user-a", venueId: 4 });
    const sent: Array<{ key: string | null; body: string }> = [];
    const fetcher = (async (_url, init) => {
      const headers = new Headers(init?.headers);
      sent.push({ key: headers.get("Idempotency-Key"), body: String(init?.body) });
      return new Response("{}", { status: 503 });
    }) as typeof fetch;

    await submitBookingCreateRequest({
      scope,
      payload: { venueId: 4, hallId: 11, eventDate: "2026-10-10" },
      storage,
      fetcher,
      createRequestId: () => REQUEST_ID,
    });
    const retry = await submitBookingCreateRequest({
      scope,
      payload: { venueId: 4, hallId: 11, eventDate: "2027-01-01" },
      storage,
      fetcher,
      createRequestId: () => OTHER_ID,
    });
    assert.equal(retry.ok, false);
    assert.equal(retry.requestId, REQUEST_ID);
    assert.deepEqual(sent, [
      { key: REQUEST_ID, body: JSON.stringify({ venueId: 4, hallId: 11, eventDate: "2026-10-10" }) },
      { key: REQUEST_ID, body: JSON.stringify({ venueId: 4, hallId: 11, eventDate: "2026-10-10" }) },
    ]);
    assert.equal(readPendingBookingCreateRequest(storage, scope)?.requestId, REQUEST_ID);
  });

  test("Hall A to Hall B with the same pending key is a conflict", async () => {
    const storage = memoryStorage();
    const scope = bookingCreateScope({ actorId: "user-a", venueId: 4 });
    await submitBookingCreateRequest({
      scope,
      payload: { venueId: 4, hallId: 11 },
      storage,
      fetcher: (async () => new Response("{}", { status: 503 })) as typeof fetch,
      createRequestId: () => REQUEST_ID,
    });
    await assert.rejects(
      submitBookingCreateRequest({
        scope,
        payload: { venueId: 4, hallId: 12 },
        storage,
        fetcher: (async () => new Response(JSON.stringify({ id: 1 }), { status: 201 })) as typeof fetch,
        createRequestId: () => OTHER_ID,
      }),
      (error: unknown) => error instanceof BookingCreateHallConflictError,
    );
    assert.equal(readPendingBookingCreateRequest(storage, scope)?.payload.hallId, 11);
  });
});
