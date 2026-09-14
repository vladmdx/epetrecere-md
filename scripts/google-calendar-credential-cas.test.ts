import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  googleCalendarCredentialFingerprint,
  readGoogleTokenErrorCode,
} from "../src/lib/google/calendar";

const base = {
  refreshToken: "refresh-a",
  accessToken: "access-a",
  expiresAt: new Date("2026-09-14T12:00:00.000Z"),
};

test("credential generation covers refresh, access and expiry", () => {
  const fingerprint = googleCalendarCredentialFingerprint(base);
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.notEqual(fingerprint, googleCalendarCredentialFingerprint({
    ...base,
    refreshToken: "refresh-b",
  }));
  assert.notEqual(fingerprint, googleCalendarCredentialFingerprint({
    ...base,
    accessToken: "access-b",
  }));
  assert.notEqual(fingerprint, googleCalendarCredentialFingerprint({
    ...base,
    expiresAt: new Date("2026-09-14T13:00:00.000Z"),
  }));
});

test("bounded token error parsing distinguishes invalid_grant from other 400/401 errors", async () => {
  assert.equal(await readGoogleTokenErrorCode(new Response(
    JSON.stringify({ error: "invalid_grant", error_description: "revoked" }),
    { status: 400 },
  )), "invalid_grant");
  assert.equal(await readGoogleTokenErrorCode(new Response(
    JSON.stringify({ error: "invalid_client" }),
    { status: 400 },
  )), "invalid_client");
  assert.equal(await readGoogleTokenErrorCode(new Response(
    JSON.stringify({ error: "invalid_client" }),
    { status: 401 },
  )), "invalid_client");
  assert.equal(await readGoogleTokenErrorCode(new Response(
    "x".repeat(4_097),
    { status: 400, headers: { "content-length": "4097" } },
  )), null);
});

test("refresh writes and invalid_grant clearing are full-tuple CAS operations", () => {
  const source = readFileSync("src/lib/google/calendar.ts", "utf8");
  const matcher = source.slice(
    source.indexOf("function credentialMatch"),
    source.indexOf("export async function readGoogleTokenErrorCode"),
  );
  assert.match(matcher, /googleRefreshToken/);
  assert.match(matcher, /googleAccessToken/);
  assert.match(matcher, /googleTokenExpiresAt/);
  assert.equal((source.match(/\.where\(credentialMatch\(userId, snapshot\)\)/g) ?? []).length, 2);
  assert.equal((source.match(/\.returning\(\{ id: users\.id \}\)/g) ?? []).length, 2);
  assert.match(source, /providerErrorCode === "invalid_grant"/);
  assert.doesNotMatch(source, /res\.status === 400 \|\| res\.status === 401/);
});

test("sync discards a lost generation and callback preserves omitted refresh tokens", () => {
  const worker = readFileSync("src/lib/inngest/functions.ts", "utf8");
  assert.match(worker, /expectedCredentialFingerprint:\s*contributor\.credentialFingerprint/);
  assert.match(worker, /fetchUpcomingEvents\(credential\.accessToken/);
  assert.match(worker, /credentialFingerprint:\s*credential\.credentialFingerprint/);

  const callback = readFileSync(
    "src/app/api/auth/google/callback/route.ts",
    "utf8",
  );
  assert.match(
    callback,
    /if \(typeof tokens\.refresh_token === "string" && tokens\.refresh_token\) \{[\s\S]*update\.googleRefreshToken = tokens\.refresh_token/,
  );
  assert.doesNotMatch(callback, /googleRefreshToken:\s*tokens\.refresh_token \|\| null/);
});

test("orphan sweep is bounded and delegates deletion to the locked writer", () => {
  const source = readFileSync("src/lib/google/calendar-sync.ts", "utf8");
  assert.match(source, /MAX_GOOGLE_SYNC_ORPHAN_ROWS_PER_RUN = 250/);
  assert.match(source, /\.limit\(MAX_GOOGLE_SYNC_ORPHAN_ROWS_PER_RUN\)/);
  const cleanup = source.slice(source.indexOf(
    "export async function clearGoogleCalendarOrphanProjection",
  ));
  assert.match(cleanup, /replaceManagedCalendarEvents\(/);
  assert.match(cleanup, /authorizeAfterLocks/);
  assert.match(cleanup, /if \(parent\) throw new GoogleCalendarSyncAuthorizationError/);
});
