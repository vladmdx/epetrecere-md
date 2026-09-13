import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_EFFECT_MAX_ATTEMPTS,
  BOOKING_EFFECT_MAX_BACKOFF_MS,
  BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
  bookingEffectError,
  bookingEffectHeartbeatMs,
  bookingEffectRetryDelayMs,
} from "../src/lib/booking/effect-outbox-policy";
import { db } from "../src/lib/db";
import { dispatchNotificationChannel } from "../src/lib/notifications/dispatch";

test("outbox backoff is exponential and capped", () => {
  assert.equal(bookingEffectRetryDelayMs(1), 30_000);
  assert.equal(bookingEffectRetryDelayMs(2), 60_000);
  assert.equal(bookingEffectRetryDelayMs(3), 120_000);
  assert.equal(bookingEffectRetryDelayMs(99), BOOKING_EFFECT_MAX_BACKOFF_MS);
});

test("attempt and lease policies are bounded", () => {
  assert.equal(BOOKING_EFFECT_MAX_ATTEMPTS, 8);
  assert.ok(BOOKING_EFFECT_PROVIDER_TIMEOUT_MS < 300_000);
  assert.equal(bookingEffectHeartbeatMs(300_000), 30_000);
  assert.equal(bookingEffectHeartbeatMs(60), 20);
  assert.equal(bookingEffectHeartbeatMs(1), 10);
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

test("durable channel dispatch reuses the supplied transaction executor", async () => {
  let inserts = 0;
  const executor = {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => { inserts += 1; },
      }),
    }),
  } as unknown as typeof db;
  const input = {
    userId: "test-user",
    type: "booking_status_changed",
    title: "Confirmed",
    dedupeKey: "booking:1:test-user:confirmed",
  };
  await dispatchNotificationChannel(input, "in_app", {}, { executor });
  assert.equal(inserts, 1);

  let forwarded: typeof db | undefined;
  await dispatchNotificationChannel(input, "push", {
    sendPushToUser: async (_userId, _payload, options) => {
      forwarded = options?.executor;
      return { sent: 1, pruned: 0, failed: 0 };
    },
  }, { executor, timeoutMs: 100 });
  assert.equal(forwarded, executor);
});
