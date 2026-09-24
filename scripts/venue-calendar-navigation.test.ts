import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { venueCalendarNavigationPath } from "../src/lib/calendar/venue-navigation";

test("month and today navigation retain the selected hall and venue", () => {
  const base = "/dashboard/locatii/30/calendar";
  assert.equal(venueCalendarNavigationPath(base, { month: "2026-10" }, 3), `${base}?month=2026-10&hallId=3`);
  assert.equal(venueCalendarNavigationPath(base, { date: "2026-09-25" }, 4), `${base}?date=2026-09-25&hallId=4`);
  assert.equal(venueCalendarNavigationPath(base, { month: "2026-10" }, null), `${base}?month=2026-10`);
  const client = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/calendar/client.tsx", "utf8");
  for (const name of ["navigateMonth", "jumpToMonth", "goToday"]) {
    const start = client.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} must exist`);
    const body = client.slice(start).split("\n  }")[0];
    assert.match(body, /venueCalendarNavigationPath\(basePath,/);
    assert.match(body, /selectedHallId/);
  }
});
