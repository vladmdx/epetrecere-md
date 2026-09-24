import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAccountRole } from "../src/lib/auth/check-role-client";

test("a delayed session is retried before routing an existing partner", async () => {
  let calls = 0;
  const result = await fetchAccountRole(async () => {
    calls += 1;
    return calls < 3 ? new Response(null, { status: 401 }) : Response.json({ role: "venue" });
  }, async () => {});
  assert.equal(calls, 3);
  assert.equal((await result.json()).role, "venue");
});

test("persistent service failure stays an error, not a new-user result", async () => {
  let calls = 0;
  const result = await fetchAccountRole(async () => {
    calls += 1;
    return new Response(null, { status: 503 });
  }, async () => {});
  assert.equal(result.status, 503);
  assert.equal(calls, 3);
});

test("network failures can recover; permanent denials are not retried", async () => {
  let calls = 0;
  const response = await fetchAccountRole(async () => {
    if (++calls === 1) throw new TypeError("Failed to fetch");
    return new Response(null, { status: 403 });
  }, async () => {});
  assert.equal(calls, 2);
  assert.equal(response.status, 403);
});
