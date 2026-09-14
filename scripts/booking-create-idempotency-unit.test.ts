import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingCreationPayloadHash,
  bookingCreationScopeHash,
  canonicalBookingCreatePayloadV1,
  type BookingCreatePayloadInput,
} from "../src/lib/booking/booking-create-idempotency";

const base: BookingCreatePayloadInput = {
  artistId: 42,
  venueId: null,
  eventPlanId: 7,
  hallId: null,
  reservationScope: null,
  clientName: "Client Canonical",
  clientPhone: "+37369000000",
  clientEmail: "client@example.invalid",
  eventDate: "2032-06-12",
  startTime: "18:00",
  endTime: "20:00",
  eventType: "wedding",
  guestCount: 100,
  message: "Mesaj redactat",
  agreedPrice: 900,
  packageId: 3,
};

test("scope hashes are server-only, stable and separated by actor", () => {
  const anonymous = bookingCreationScopeHash(null);
  const actor = bookingCreationScopeHash("user_secret_clerk_id");
  assert.match(anonymous, /^[a-f0-9]{64}$/);
  assert.match(actor, /^[a-f0-9]{64}$/);
  assert.equal(anonymous, bookingCreationScopeHash(null));
  assert.notEqual(anonymous, actor);
  assert.ok(!actor.includes("user_secret_clerk_id"));
});

test("v1 canonical payload has a fixed order and maps optional values to null", () => {
  const canonical = canonicalBookingCreatePayloadV1({
    ...base,
    clientEmail: null,
    startTime: null,
    endTime: null,
  });
  assert.deepEqual(Object.keys(canonical), [
    "version",
    "artistId",
    "venueId",
    "eventPlanId",
    "hallId",
    "reservationScope",
    "clientName",
    "clientPhone",
    "clientEmail",
    "eventDate",
    "startTime",
    "endTime",
    "eventType",
    "guestCount",
    "message",
    "agreedPrice",
    "packageId",
  ]);
  assert.equal(canonical.version, 1);
  assert.equal(canonical.clientEmail, null);
  assert.equal(canonical.startTime, null);
});

test("same canonical request hashes identically; a material change conflicts", () => {
  const first = bookingCreationPayloadHash(base);
  assert.equal(first, bookingCreationPayloadHash({ ...base }));
  assert.notEqual(first, bookingCreationPayloadHash({ ...base, artistId: 43 }));
  assert.notEqual(
    first,
    bookingCreationPayloadHash({ ...base, message: "Alt mesaj" }),
  );
  assert.notEqual(first, bookingCreationPayloadHash({ ...base, packageId: 4 }));
});

test("authenticated retries ignore server-managed name/email but bind caller phone", () => {
  const options = { serverManagedClientIdentity: true } as const;
  const first = bookingCreationPayloadHash(base, options);
  assert.equal(
    first,
    bookingCreationPayloadHash(
      {
        ...base,
        clientName: "Nume actualizat",
        clientEmail: "updated@example.invalid",
      },
      options,
    ),
  );
  assert.notEqual(
    first,
    bookingCreationPayloadHash(
      { ...base, clientPhone: "+37368000000" },
      options,
    ),
  );
  assert.notEqual(
    first,
    bookingCreationPayloadHash({ ...base, message: "Alt mesaj" }, options),
  );
  assert.notEqual(
    bookingCreationPayloadHash(base),
    bookingCreationPayloadHash(
      { ...base, clientPhone: "+37368000000" },
    ),
  );
});
