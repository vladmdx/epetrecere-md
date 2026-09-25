import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { bookingHallLabel } from "../src/lib/booking/hall-display";
import { bookingHallNameSql } from "../src/lib/booking/hall-display-sql";

for (const [locale, hall, whole] of [["ro", "Sală", "Întregul local"], ["ru", "Зал", "Всё заведение"], ["en", "Hall", "Entire venue"]] as const) {
  test(`${locale}: hall name, legacy fallback and whole-venue scope are distinct`, () => {
    assert.equal(bookingHallLabel({ hallName: " Grand ", hallId: 3 }, locale), `${hall}: Grand`);
    assert.equal(bookingHallLabel({ hallName: "Grand", hallId: 3, reservationScope: "venue" }, locale), whole);
    assert.match(bookingHallLabel({ hallId: 3 }, locale), /3/);
    assert.notEqual(bookingHallLabel({}, locale), whole);
    assert.doesNotMatch(bookingHallLabel({ hallName: " " }, locale), /booking\.|\{.*\}/);
    assert.equal(bookingHallLabel({ hallId: null, hallName: "Deleted hall" }, locale), `${hall}: Deleted hall`);
  });
}

test("SQL projection prefers nonempty historical strings and keeps fallback parameterized", () => {
  const query = new PgDialect().sqlToQuery(bookingHallNameSql(sql`${JSON.stringify({ hallName: "Original" })}::jsonb`, sql`${"Renamed"}::text`));
  assert.match(query.sql, /jsonb_typeof/);
  assert.match(query.sql, /coalesce/);
  assert.match(query.sql, /nullif\(btrim/);
  assert.doesNotMatch(query.sql, /Original|Renamed/);
  assert.ok(query.params.includes("Renamed"));
});

test("both authorized list queries use a same-venue left join and redact hall contact text", () => {
  for (const file of ["src/lib/db/queries/venue-bookings.ts", "src/app/api/booking-requests/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /hallName: bookingHallNameSql\(bookingRequests.commercialSnapshot, venueHalls.nameRo\)/);
    assert.match(source, /\.leftJoin\(venueHalls, and\(eq\(venueHalls.id, bookingRequests.hallId\), eq\(venueHalls.venueId, bookingRequests.venueId\)\)\)/);
    assert.match(source, /hallName: bookingTextForViewer\(/);
    assert.doesNotMatch(source, /commercialSnapshot: bookingRequests.commercialSnapshot/);
  }
});

test("owner card and acceptance dialog, and client card display the selected hall", () => {
  const owner = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/rezervari/client.tsx", "utf8");
  const client = readFileSync("src/app/[locale]/(client)/cabinet/rezervari/page.tsx", "utf8");
  assert.match(owner, /bookingHallLabel\(b, locale\)/);
  assert.match(owner, /bookingHallLabel\(acceptDialog, locale\)/);
  assert.match(client, /b.venueId != null \|\| b.hallName != null/);
  assert.match(client, /bookingHallLabel\(b, locale\)/);
});
