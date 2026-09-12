import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_EFFECT_MAX_BACKOFF_MS,
  bookingEffectError,
  bookingEffectRetryDelayMs,
} from "../src/lib/booking/effect-outbox-policy";

test("outbox backoff is exponential and capped", () => {
  assert.equal(bookingEffectRetryDelayMs(1), 30_000);
  assert.equal(bookingEffectRetryDelayMs(2), 60_000);
  assert.equal(bookingEffectRetryDelayMs(3), 120_000);
  assert.equal(bookingEffectRetryDelayMs(99), BOOKING_EFFECT_MAX_BACKOFF_MS);
});

test("stored provider errors are bounded and never blank", () => {
  assert.equal(bookingEffectError(""), "unknown delivery error");
  assert.equal(bookingEffectError(new Error("provider down")), "provider down");
  assert.equal(
    bookingEffectError(new AggregateError([new Error("push down"), new Error("email down")], "channels failed")),
    "channels failed: push down; email down",
  );
  assert.equal(
    bookingEffectError(new AggregateError([
      new AggregateError([new Error("nested email down")], "recipient failed"),
    ], "confirmation failed")),
    "confirmation failed: nested email down",
  );
  assert.equal(bookingEffectError("x".repeat(3_000)).length, 2_000);
});
