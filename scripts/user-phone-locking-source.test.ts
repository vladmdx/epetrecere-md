import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("canonical account phone writes", () => {
  test("the shared writer locks user then canonical phone before collision lookup", () => {
    const source = read("src/lib/auth/user-phone.ts");
    assert.match(source, /acquireLegalScopeLock\(tx, \{ userId \}\)/);
    assert.match(source, /acquireAccountPhoneLock\(executor, normalizedPhone\)/);
    assert.match(source, /eq\(users\.phone, normalizedPhone\)/);
    assert.match(source, /ne\(users\.id, userId\)/);
  });

  test("registration claims the phone inside the serialized role transaction", () => {
    const roleClaim = read("src/lib/auth/select-role.ts");
    const artistRoute = read("src/app/api/auth/register-artist/route.ts");
    const venueRoute = read("src/app/api/auth/register-venue/route.ts");
    assert.match(roleClaim, /writeUserPhoneLocked\(/);
    assert.match(roleClaim, /if \(!effectivePhone\)[\s\S]*code: "INVALID_PHONE"/);
    assert.match(artistRoute, /normalizedPhone: requestedPhone/);
    assert.match(artistRoute, /requestedPhone \?\? lockedUser\.phone/);
    assert.doesNotMatch(artistRoute, /lockedUser\.phone \?\? ""/);
    assert.match(
      artistRoute,
      /claimed\.code === "ARTIST_ALREADY_REGISTERED"[\s\S]*claimed\.replayable[\s\S]*replayed: true/,
    );
    assert.match(venueRoute, /normalizedPhone,/);
    assert.doesNotMatch(artistRoute, /ne\(users\.id, appUser\.id\)/);
    assert.doesNotMatch(venueRoute, /ne\(users\.id, appUser\.id\)/);
  });

  test("fallback account creation never preclaims an unchecked Clerk phone", () => {
    for (const path of [
      "src/app/api/auth/register-artist/route.ts",
      "src/app/api/auth/register-venue/route.ts",
      "src/app/api/auth/select-role/route.ts",
      "src/app/api/auth/set-phone/route.ts",
      "src/app/api/auth/check-role/route.ts",
      "src/app/api/legal/accept/route.ts",
      "src/app/api/webhooks/clerk/route.ts",
    ]) {
      const source = read(path);
      assert.doesNotMatch(
        source,
        /insert\(users\)[\s\S]{0,800}?phone:\s*(?:clerkUser|cu)\.phoneNumbers/,
        path,
      );
    }
  });

  test("check-role is authenticated and never trusts an arbitrary email query", () => {
    const source = read("src/app/api/auth/check-role/route.ts");
    assert.match(source, /const \{ userId: clerkId \} = await auth\(\)/);
    assert.match(source, /if \(!clerkId\)[\s\S]*status: 401/);
    assert.match(source, /eq\(users\.clerkId, clerkId\)/);
    assert.doesNotMatch(source, /searchParams\.get\(["']email["']\)/);
    assert.doesNotMatch(source, /eq\(users\.email,/);
  });

  test("personal registration cannot consume organization-scoped evidence", () => {
    const gate = read("src/lib/legal/registration-gate.ts");
    assert.match(gate, /isNull\(legalAcceptances\.organizationId\)/);
    for (const path of [
      "src/app/api/auth/register-artist/route.ts",
      "src/app/api/auth/register-venue/route.ts",
    ]) {
      const source = read(path);
      const linkStart = source.indexOf(".update(legalAcceptances)");
      assert.ok(linkStart >= 0, path);
      const link = source.slice(linkStart, linkStart + 700);
      assert.match(link, /isNull\(legalAcceptances\.organizationId\)/, path);
    }
  });

  test("settings and Clerk synchronization delegate to the shared writer", () => {
    for (const path of [
      "src/app/api/auth/set-phone/route.ts",
      "src/app/api/me/phone/route.ts",
      "src/app/api/webhooks/clerk/route.ts",
    ]) {
      assert.match(read(path), /writeUserPhoneInDatabase\(/, path);
    }
    const webhook = read("src/app/api/webhooks/clerk/route.ts");
    assert.match(webhook, /type === "user\.created" && appUserId && phone/);
    assert.match(webhook, /\{ onlyIfMissing: true \}/);
    assert.match(read("src/lib/auth/user-phone.ts"), /options\.onlyIfMissing && current\.phone != null/);
  });
});
