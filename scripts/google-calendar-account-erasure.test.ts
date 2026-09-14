import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("both account-erasure paths purge Google summaries before deleting the user", () => {
  for (const path of [
    "src/app/api/me/delete-account/route.ts",
    "src/app/api/webhooks/clerk/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    const membershipLocks = source.indexOf("acquireUserMembershipMutationLocks(");
    const purge = source.indexOf("purgeGoogleCalendarForAccountErasure(", membershipLocks);
    const userDelete = source.indexOf("delete(users)", purge);
    assert.ok(
      membershipLocks >= 0 && purge > membershipLocks && userDelete > purge,
      `${path} must lock membership scopes, purge summaries, then delete user`,
    );
  }
});

test("erasure deletes owned projections and safely scrubs shared organization notes", () => {
  const source = readFileSync("src/lib/google/calendar-erasure.ts", "utf8");
  assert.match(source, /eq\(artists\.userId, input\.userId\)/);
  assert.match(source, /eq\(venues\.userId, input\.userId\)/);
  assert.match(source, /isNull\(venues\.organizationId\)/);
  assert.match(source, /inArray\(venues\.organizationId, \[\.\.\.input\.organizationIds\]\)/);
  assert.match(source, /eq\(calendarEvents\.source, "google_sync"\)/);
  assert.match(source, /\.delete\(calendarEvents\)[\s\S]*legacyVenueIds/);
  assert.match(
    source,
    /\.update\(calendarEvents\)[\s\S]*\.set\(\{ note: "Google: Ocupat" \}\)[\s\S]*organizationVenueIds/,
  );
  assert.doesNotMatch(source, /console\.|fetch\(/);
});
