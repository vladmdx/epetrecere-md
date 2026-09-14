import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "../src/lib/safe-server-log";

test("safe server logs emit only explicitly allowed diagnostic fields", () => {
  const correlationId = createServerLogCorrelationId();
  const error = Object.assign(new Error("private prompt and user@example.test"), {
    code: "23505",
    status: 429,
    type: "rate_limit_error",
    responseBody: "private provider body",
  });
  const record = safeServerErrorLog(error, {
    correlationId,
    allowedCodes: new Set(["23505"]),
    allowedStatuses: new Set([429]),
    allowedTypes: new Set(["rate_limit_error"]),
  });

  assert.deepEqual(record, {
    correlationId,
    errorClass: "Error",
    status: 429,
    code: "23505",
    type: "rate_limit_error",
  });
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /private|example\.test|responseBody|message|stack/);
});

test("safe server logs drop unapproved values and tolerate hostile getters", () => {
  const error = new Proxy({}, {
    get(_target, property) {
      if (property === "name") return "UserControlledSecretError";
      throw new Error("getter secret");
    },
  });
  const record = safeServerErrorLog(error, {
    correlationId: "correlation-only",
    allowedCodes: new Set(["23505"]),
    allowedStatuses: new Set([500]),
  });

  assert.deepEqual(record, {
    correlationId: "correlation-only",
    errorClass: "UnknownError",
  });
});
