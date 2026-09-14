import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createGoogleOAuthState,
  GOOGLE_OAUTH_DEFAULT_RETURN_PATH,
  GOOGLE_OAUTH_STATE_TTL_SECONDS,
  safeGoogleOAuthReturnPath,
  verifyGoogleOAuthState,
} from "../src/lib/google/oauth-state";

const SECRET = "test-only-google-client-secret-with-enough-entropy";
const NOW = Date.UTC(2026, 8, 14, 10, 0, 0);

function create() {
  return createGoogleOAuthState({
    secret: SECRET,
    userId: "user_actor_a",
    sessionId: "session_a",
    returnPath: "/dashboard/artist/calendar?tab=google",
    now: NOW,
  });
}

test("OAuth state is opaque and validates only with its HttpOnly context", () => {
  const issued = create();
  assert.match(issued.state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.state.includes("dashboard"), false);
  assert.equal(issued.cookieValue.includes("dashboard"), false);
  assert.deepEqual(verifyGoogleOAuthState({
    secret: SECRET,
    userId: "user_actor_a",
    sessionId: "session_a",
    state: issued.state,
    cookieValue: issued.cookieValue,
    now: NOW + 1_000,
  }), {
    ok: true,
    returnPath: "/dashboard/artist/calendar?tab=google",
  });
});

test("missing state/cookie and a consumed-cookie replay fail closed", () => {
  const issued = create();
  assert.deepEqual(verifyGoogleOAuthState({
    secret: SECRET,
    userId: "user_actor_a",
    sessionId: "session_a",
    state: null,
    cookieValue: issued.cookieValue,
    now: NOW,
  }), { ok: false, reason: "missing" });
  assert.deepEqual(verifyGoogleOAuthState({
    secret: SECRET,
    userId: "user_actor_a",
    sessionId: "session_a",
    state: issued.state,
    cookieValue: null,
    now: NOW,
  }), { ok: false, reason: "missing" });
});

test("tampering, expiry, and session/actor mismatch fail closed", () => {
  const issued = create();
  const tampered = `${issued.cookieValue.slice(0, -1)}${
    issued.cookieValue.endsWith("a") ? "b" : "a"
  }`;
  assert.equal(verifyGoogleOAuthState({
    secret: SECRET,
    userId: "user_actor_a",
    sessionId: "session_a",
    state: issued.state,
    cookieValue: tampered,
    now: NOW,
  }).ok, false);
  assert.deepEqual(verifyGoogleOAuthState({
    secret: SECRET,
    userId: "user_actor_a",
    sessionId: "session_a",
    state: issued.state,
    cookieValue: issued.cookieValue,
    now: NOW + GOOGLE_OAUTH_STATE_TTL_SECONDS * 1_000 + 1,
  }), { ok: false, reason: "expired" });
  assert.deepEqual(verifyGoogleOAuthState({
    secret: SECRET,
    userId: "user_actor_a",
    sessionId: "session_b",
    state: issued.state,
    cookieValue: issued.cookieValue,
    now: NOW,
  }), { ok: false, reason: "actor_mismatch" });
  assert.deepEqual(verifyGoogleOAuthState({
    secret: SECRET,
    userId: "user_actor_b",
    sessionId: "session_a",
    state: issued.state,
    cookieValue: issued.cookieValue,
    now: NOW,
  }), { ok: false, reason: "actor_mismatch" });
});

test("return paths reject absolute, protocol-relative, traversal and encoded traversal", () => {
  for (const unsafe of [
    "https://evil.example/dashboard/x",
    "//evil.example/dashboard/x",
    "/dashboard/../logout",
    "/dashboard/%2e%2e/logout",
    "/dashboard/%2F%2Fevil.example",
    "/dashboard\\@evil.example",
  ]) {
    assert.equal(safeGoogleOAuthReturnPath(unsafe), GOOGLE_OAUTH_DEFAULT_RETURN_PATH);
  }
  assert.equal(
    safeGoogleOAuthReturnPath("/dashboard/sala/calendar?tab=google"),
    "/dashboard/sala/calendar?tab=google",
  );
});

test("route consumes state before token exchange and sets hardened cookie flags", () => {
  const source = readFileSync(
    new URL("../src/app/api/auth/google/callback/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.indexOf("verifyGoogleOAuthState") < source.indexOf("oauth2.googleapis.com/token"));
  assert.match(source, /httpOnly:\s*true/);
  assert.match(source, /sameSite:\s*"lax"/);
  assert.match(source, /secure:\s*process\.env\.NODE_ENV\s*===\s*"production"/);
  assert.match(source, /maxAge:\s*0/);
});
