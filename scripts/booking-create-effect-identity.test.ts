import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingCreationEffectDedupeBase,
  bookingCreationSyntheticRecipientId,
} from "../src/lib/booking/booking-create-effect-identity";

test("creation effect keys are stable and contain only event coordinates", () => {
  const input = { bookingId: 42, audience: "vendor" as const, ordinal: 1 };
  assert.equal(
    bookingCreationEffectDedupeBase(input),
    "booking:42:create:vendor:1",
  );
  assert.equal(
    bookingCreationEffectDedupeBase(input),
    bookingCreationEffectDedupeBase({ ...input }),
  );
});

test("synthetic recipient ids are deterministic UUIDs without contact input", () => {
  const first = bookingCreationSyntheticRecipientId({
    bookingId: 42,
    audience: "client",
  });
  const replay = bookingCreationSyntheticRecipientId({
    bookingId: 42,
    audience: "client",
  });
  const other = bookingCreationSyntheticRecipientId({
    bookingId: 43,
    audience: "client",
  });
  assert.equal(first, replay);
  assert.notEqual(first, other);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("invalid database coordinates are rejected", () => {
  assert.throws(() =>
    bookingCreationEffectDedupeBase({
      bookingId: 0,
      audience: "admin",
      ordinal: 0,
    }),
  );
  assert.throws(() =>
    bookingCreationEffectDedupeBase({
      bookingId: 1,
      audience: "admin",
      ordinal: -1,
    }),
  );
});
