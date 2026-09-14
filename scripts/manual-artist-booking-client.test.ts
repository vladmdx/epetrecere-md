import assert from "node:assert/strict";
import { test } from "node:test";
import {
  manualArtistBookingPayloadHash,
  manualArtistBookingScopeHash,
} from "../src/lib/booking/manual-artist-booking-idempotency";
import {
  ManualArtistBookingPersistenceError,
  submitManualArtistBooking,
} from "../src/lib/booking/manual-artist-booking-client";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

test("a network retry keeps the original UUID and exact body", async () => {
  const storage = new MemoryStorage();
  const calls: RequestInit[] = [];
  const original = {
    artistId: 7,
    eventDate: "2026-10-12",
    startTime: "18:00",
    packageId: 3,
    note: "Original",
  };

  await assert.rejects(
    submitManualArtistBooking({
      actorId: "actor-a",
      artistId: 7,
      payload: original,
      storage,
      createRequestId: () => firstId,
      fetcher: async (_url, init) => {
        calls.push(init ?? {});
        throw new TypeError("lost response");
      },
    }),
  );
  assert.equal(storage.values.size, 1);

  const response = await submitManualArtistBooking({
    actorId: "actor-a",
    artistId: 7,
    payload: {
      ...original,
      eventDate: "2026-11-01",
      note: "Changed after timeout",
    },
    storage,
    createRequestId: () => secondId,
      fetcher: async (_url, init) => {
        calls.push(init ?? {});
        return Response.json({ id: 71 }, { status: 200 });
      },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.body, JSON.stringify(original));
  assert.equal(calls[1]?.body, JSON.stringify(original));
  assert.equal(
    (calls[0]?.headers as Record<string, string>)["Idempotency-Key"],
    firstId,
  );
  assert.equal(
    (calls[1]?.headers as Record<string, string>)["Idempotency-Key"],
    firstId,
  );
  assert.equal(storage.values.size, 0);
});

test("an invalid or truncated 2xx keeps the envelope and replays its UUID/body", async () => {
  const storage = new MemoryStorage();
  const calls: RequestInit[] = [];
  const payload = {
    artistId: 17,
    eventDate: "2026-12-24",
    startTime: "18:00",
    packageId: 4,
  };

  await assert.rejects(
    submitManualArtistBooking({
      actorId: "actor-a",
      artistId: 17,
      payload,
      storage,
      createRequestId: () => firstId,
      fetcher: async (_url, init) => {
        calls.push(init ?? {});
        return new Response("{\"id\":", { status: 201 });
      },
    }),
    (error: unknown) =>
      (error as { code?: unknown }).code
        === "MANUAL_ARTIST_BOOKING_INVALID_SUCCESS",
  );
  assert.equal(storage.values.size, 1);

  const replay = await submitManualArtistBooking({
    actorId: "actor-a",
    artistId: 17,
    payload: { ...payload, packageId: 99 },
    storage,
    createRequestId: () => secondId,
    fetcher: async (_url, init) => {
      calls.push(init ?? {});
      return Response.json({ id: 88 }, { status: 200 });
    },
  });
  assert.equal(replay.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.body), [
    JSON.stringify(payload),
    JSON.stringify(payload),
  ]);
  assert.deepEqual(calls.map((call) =>
    (call.headers as Record<string, string>)["Idempotency-Key"]), [
    firstId,
    firstId,
  ]);
  assert.equal(storage.values.size, 0);
});

test("ambiguous HTTP responses retain the envelope; deterministic ones clear it", async () => {
  const storage = new MemoryStorage();
  const ids: string[] = [];
  const payload = {
    artistId: 9,
    eventDate: "2026-12-20",
    startTime: "20:00",
    packageId: 5,
  };
  const ambiguous = await submitManualArtistBooking({
    actorId: "actor-a",
    artistId: 9,
    payload,
    storage,
    createRequestId: () => firstId,
    fetcher: async (_url, init) => {
      ids.push((init?.headers as Record<string, string>)["Idempotency-Key"]);
      return new Response("{}", { status: 503 });
    },
  });
  assert.equal(ambiguous.status, 503);
  assert.equal(storage.values.size, 1);

  const deterministic = await submitManualArtistBooking({
    actorId: "actor-a",
    artistId: 9,
    payload,
    storage,
    createRequestId: () => secondId,
    fetcher: async (_url, init) => {
      ids.push((init?.headers as Record<string, string>)["Idempotency-Key"]);
      return new Response("{}", { status: 409 });
    },
  });
  assert.equal(deterministic.status, 409);
  assert.deepEqual(ids, [firstId, firstId]);
  assert.equal(storage.values.size, 0);
});

test("a different signed-in actor cannot inherit another owner's pending body", async () => {
  const storage = new MemoryStorage();
  const bodies: string[] = [];
  const firstPayload = {
    artistId: 11,
    eventDate: "2026-12-21",
    startTime: "18:00",
    packageId: 2,
    note: "Actor A",
  };
  await assert.rejects(
    submitManualArtistBooking({
      actorId: "actor-a",
      artistId: 11,
      payload: firstPayload,
      storage,
      createRequestId: () => firstId,
      fetcher: async (_url, init) => {
        bodies.push(String(init?.body));
        throw new TypeError("lost response");
      },
    }),
  );

  const secondPayload = { ...firstPayload, note: "Actor B" };
  const response = await submitManualArtistBooking({
    actorId: "actor-b",
    artistId: 11,
    payload: secondPayload,
    storage,
    createRequestId: () => secondId,
    fetcher: async (_url, init) => {
      bodies.push(String(init?.body));
      return Response.json({ id: 81 }, { status: 201 });
    },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(bodies, [JSON.stringify(firstPayload), JSON.stringify(secondPayload)]);
  assert.equal(storage.values.size, 1, "actor A's unresolved envelope remains isolated");
});

test("failed compare-and-clear never acknowledges deterministic failure or success", async () => {
  const storage = new MemoryStorage();
  let removalWorks = false;
  const unreliableStorage = {
    getItem: storage.getItem.bind(storage),
    setItem: storage.setItem.bind(storage),
    removeItem(key: string) {
      if (removalWorks) storage.removeItem(key);
    },
  };
  const options = {
    actorId: "actor-a",
    artistId: 21,
    payload: { artistId: 21, eventDate: "2027-01-15", startTime: "18:00" },
    storage: unreliableStorage,
    createRequestId: () => firstId,
  };

  await assert.rejects(
    submitManualArtistBooking({
      ...options,
      fetcher: async () => new Response("{}", { status: 400 }),
    }),
    ManualArtistBookingPersistenceError,
  );
  assert.equal(storage.values.size, 1);

  await assert.rejects(
    submitManualArtistBooking({
      ...options,
      payload: { artistId: 21, eventDate: "2028-01-15", startTime: "20:00" },
      fetcher: async () => Response.json({ id: 121 }, { status: 200 }),
    }),
    ManualArtistBookingPersistenceError,
  );
  assert.equal(storage.values.size, 1);

  removalWorks = true;
  const retry = await submitManualArtistBooking({
    ...options,
    payload: { artistId: 21, eventDate: "2029-01-15", startTime: "21:00" },
    fetcher: async () => Response.json({ id: 121 }, { status: 200 }),
  });
  assert.equal(retry.ok, true);
  assert.equal(storage.values.size, 0);
});

test("manual idempotency hashes are canonical and endpoint-scoped", () => {
  const base = {
    artistId: 4,
    eventDate: "2026-09-30",
    startTime: "23:00",
    packageId: 8,
    price: null,
    note: "  Nuntă  ",
    eventType: " wedding ",
  };
  assert.equal(
    manualArtistBookingPayloadHash(base),
    manualArtistBookingPayloadHash({
      ...base,
      note: "Nuntă",
      eventType: "wedding",
      price: undefined,
    }),
  );
  assert.notEqual(
    manualArtistBookingPayloadHash(base),
    manualArtistBookingPayloadHash({ ...base, packageId: 9 }),
  );
  assert.notEqual(
    manualArtistBookingScopeHash("actor-a"),
    manualArtistBookingScopeHash("actor-b"),
  );
  assert.equal(manualArtistBookingScopeHash("actor-a").length, 64);
});
