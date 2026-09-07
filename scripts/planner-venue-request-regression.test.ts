import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { venueRequestInterval } from "../src/lib/planner/venue-request-interval";
import { planTabFromQuery, planTabHref } from "../src/lib/planner/tab-navigation";
import { localizePath } from "../src/lib/i18n/routing";

test("venue request preserves the QA plan's 14:00 to midnight interval", () => {
  assert.deepEqual(venueRequestInterval({ startTime: "14:00", durationHours: 10 }), { startTime: "14:00", endTime: "00:00" });
});

test("venue intervals preserve minutes, overnight events and whole-day plans", () => {
  assert.deepEqual(venueRequestInterval({ startTime: "14:30", durationHours: 3 }), { startTime: "14:30", endTime: "17:30" });
  assert.deepEqual(venueRequestInterval({ startTime: "21:45", durationHours: 6 }), { startTime: "21:45", endTime: "03:45" });
  assert.deepEqual(venueRequestInterval({ startTime: "09:00", durationHours: 24 }), { startTime: "09:00", endTime: "09:00" });
});

test("old or malformed plans never produce a guessed or invalid time interval", () => {
  for (const plan of [
    {}, { startTime: null, durationHours: null }, { startTime: "14:00" },
    { startTime: "24:00", durationHours: 10 }, { startTime: "14:99", durationHours: 10 },
    { startTime: "14:00", durationHours: 0 }, { startTime: "14:00", durationHours: -1 },
    { startTime: "14:00", durationHours: 25 }, { startTime: "14:00", durationHours: Number.NaN },
  ]) assert.deepEqual(venueRequestInterval(plan), {});
});

test("same-plan venue to artist navigation updates the visible tab from its new URL", () => {
  const first = planTabHref(99, "venues", "tab=bookings&source=dashboard");
  assert.equal(first, "/cabinet/planifica/99?tab=venues&source=dashboard");
  assert.equal(planTabFromQuery(new URL(first, "https://example.invalid").searchParams.get("tab")), "venues");
  const afterBooking = planTabHref(99, "bookings");
  assert.equal(planTabFromQuery(new URL(afterBooking, "https://example.invalid").searchParams.get("tab")), "bookings");
  assert.equal(planTabFromQuery(null), "overview");
  assert.equal(planTabFromQuery("unknown"), "overview");
});

for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: post-booking planner navigation keeps the language`, () => {
    assert.equal(localizePath(planTabHref(99, "bookings"), locale), `${locale === "ro" ? "" : `/${locale}`}/cabinet/planifica/99?tab=bookings`);
  });
}

test("actual venue request body includes the interval and navigation is URL-driven", () => {
  const source = readFileSync("src/app/[locale]/(client)/cabinet/planifica/[id]/page.tsx", "utf8");
  const venue = source.slice(source.indexOf("function VenueDiscoveryCard("));
  assert.match(venue, /eventDate: plan\.eventDate,\s+\.\.\.venueRequestInterval\(plan\)/);
  assert.match(venue, /const router = useLocalizedRouter\(\)/);
  assert.match(venue, /router\.replace\(planTabHref\(plan\.id, "bookings"\), \{ scroll: false \}\)/);
  assert.match(source, /const activeTab = planTabFromQuery\(searchParams\?\.get\("tab"\)\)/);
  assert.match(source, /router\.replace\(planTabHref\(planId, tab, searchParams\?\.toString\(\)\)/);
  assert.doesNotMatch(source, /\[activeTab, setActiveTab\] = useState/);
});
