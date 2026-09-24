import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";

// Exercise the server page without Clerk credentials or any database connection.
const original = Module._load;
const load = createRequire(__filename);
let token: string | null = null;
let authorized = true;
const Calendar = () => null;
const Settings = () => null;
Object.assign(globalThis, { React });
Module._load = function (request, parent, isMain) {
  if (request === "@clerk/nextjs/server") return { auth: async () => ({ userId: "clerk-demo" }) };
  if (request === "next/navigation") return { redirect: (url: string) => { throw new Error(`redirect:${url}`); } };
  if (request === "@/lib/venues/dashboard-scope") return {
    requireLocatieVenue: async () => {
      if (!authorized) throw new Error("denied");
      return { id: 30, nameRo: "DEMO" };
    },
    venueDashboardBase: (id: number) => `/dashboard/locatii/${id}`,
  };
  if (request === "@/lib/calendar/ical-token") return { getVenueIcalTokenForUser: async () => token };
  if (request === "../../../sala/calendar/client") return { VenueCalendarClient: Calendar };
  if (request === "../../../sala/setari/client") return { VenueSettingsClient: Settings };
  if (request === "@/lib/booking/merged-calendar") return { getMergedVenueCalendar: async () => [] };
  if (request === "@/lib/db") return { db: { select: (fields: { calendarEnabled?: unknown }) => {
    const query = {
      from: () => query, where: () => query,
      limit: async () => fields.calendarEnabled
        ? [{ id: 30, nameRo: "DEMO", calendarEnabled: true }]
        : [{ id: "owner", googleRefreshToken: null, email: "demo@example.invalid" }],
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
    };
    return query;
  } } };
  return original.call(this, request, parent, isMain);
};

void (async () => {
  try {
    const page = load("../src/app/[locale]/(vendor)/dashboard/locatii/[venueId]/calendar/page").default;
    const args = { params: Promise.resolve({ locale: "ro", venueId: "30" }), searchParams: Promise.resolve({ month: "2026-09", hallId: "3" }) };
    const draft = await page(args);
    assert.equal(draft.type, Calendar);
    assert.equal(draft.props.icalUrl, null);
    assert.equal(draft.props.venueId, 30);
    assert.equal(draft.props.selectedHallId, 3);
    token = "test-feed-token";
    const active = await page(args);
    assert.match(active.props.icalUrl, /\/venue-ical\/30\/test-feed-token\.ics\?hallId=3$/);
    const settingsPage = load("../src/app/[locale]/(vendor)/dashboard/locatii/[venueId]/setari/page").default;
    token = null;
    const draftSettings = await settingsPage(args);
    assert.equal(draftSettings.type, Settings);
    assert.equal(draftSettings.props.icalUrl, null);
    assert.equal(draftSettings.props.venue.id, 30);
    token = "test-feed-token";
    assert.match((await settingsPage(args)).props.icalUrl, /\/venue-ical\/30\/test-feed-token\.ics$/);
    authorized = false;
    await assert.rejects(page(args), /denied/);
    await assert.rejects(settingsPage(args), /denied/);

    const client = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/calendar/client.tsx", "utf8");
    assert.match(client, /if \(!icalUrl\) return/);
    assert.match(client, /disabled=\{!icalUrl\}/);
    assert.match(client, /open=\{showIcalSheet && !!icalUrl\}/);
    const settingsClient = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/setari/client.tsx", "utf8");
    assert.match(settingsClient, /if \(!icalUrl\) return/);
    assert.match(settingsClient, /disabled=\{!icalUrl\}/);
    // The feed itself must still require an active organization.
    assert.match(readFileSync("src/lib/calendar/ical-token.ts", "utf8"), /eq\(partnerOrganizations.status, "active"\)/);
    console.log("Draft calendar and settings render without a feed; active feed, hall scope and access denial verified");
  } finally {
    Module._load = original;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
