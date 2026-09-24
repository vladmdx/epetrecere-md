import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const original = Module._load;
const load = createRequire(__filename);
let allow = true;
let reads = 0;
const writes: number[] = [];
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/venue-access") return {
    getCurrentAppUser: async () => ({ id: "owner" }),
    resolveSelectedVenue: async (_user: string, id: number) => ({ ok: true, venueId: id }),
    listAccessibleVenueIds: async () => [30],
    requireVenueAccess: async () => { reads += 1; return { ok: allow }; },
  };
  if (request === "./last-selected") return {
    readLastVenueCookie: async () => 30,
    writeLastVenueCookie: async (id: number) => { writes.push(id); },
  };
  if (request === "@/lib/feature-flags") return { isMultiHallEnabled: () => true };
  if (request === "next/navigation") return { redirect: (path: string) => { throw new Error(`redirect:${path}`); } };
  if (request === "@/lib/db") return { db: { select: () => {
    const q = { from: () => q, where: () => q, limit: async () => [{ id: 30, organizationId: 3 }] };
    return q;
  } } };
  return original.call(this, request, parent, isMain);
};

void (async () => {
  try {
    const { loadAuthorizedDashboardVenue, redirectLegacySalaPath } = load("../src/lib/venues/dashboard-scope");
    assert.equal((await loadAuthorizedDashboardVenue(30)).id, 30);
    assert.equal((await loadAuthorizedDashboardVenue()).id, 30);
    await assert.rejects(redirectLegacySalaPath({ locale: "ro", restPath: "/calendar" }), /redirect:.*\/dashboard\/locatii\/30\/calendar/);
    assert.deepEqual(writes, [], "rendering and redirects cannot mutate cookies");

    const { rememberVenueSelection } = load("../src/lib/venues/remember-selection");
    for (const id of [0, -1, 1.5, NaN, Infinity, "30"]) assert.equal(await rememberVenueSelection(id), false);
    assert.equal(reads, 0);
    allow = false;
    assert.equal(await rememberVenueSelection(999), false);
    assert.deepEqual(writes, []);
    allow = true;
    assert.equal(await rememberVenueSelection(30), true);
    assert.deepEqual(writes, [30]);

    const picker = readFileSync("src/app/[locale]/(vendor)/dashboard/locatii/page.tsx", "utf8");
    assert.doesNotMatch(picker, /writeLastVenueCookie|venues\.length === 1/);
    assert.match(picker, /Adaugă local/);
    const layout = readFileSync("src/app/[locale]/(vendor)/dashboard/locatii/[venueId]/layout.tsx", "utf8");
    assert.match(layout, /<RememberVenueSelection venueId=\{venue\.id\}/);
    const action = readFileSync("src/lib/venues/remember-selection.ts", "utf8");
    assert.ok(action.startsWith('"use server";'));
    console.log("Dashboard reads/redirects, authorized cookie action and single-venue picker verified");
  } finally {
    Module._load = original;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
