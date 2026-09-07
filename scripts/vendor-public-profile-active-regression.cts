/** Real public queries/pages/metadata with in-memory DB doubles. No external operations. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");
const previousLoad = Module._load, previousFetch = global.fetch, previousReact = global.React;
global.fetch = async () => { throw Error("External request forbidden"); };
global.React = React;
const dialect = new PgDialect();
let phase = "queries", active = false, calls = [], extras = 0;
const entity = kind => ({ id: kind === "artist" ? 561 : 24, slug: "qa-fixture", isActive: active,
  nameRo: `QA ${kind}`, nameEn: `QA ${kind}`, nameRu: `QA ${kind}`, descriptionRo: "Synthetic profile",
  categoryIds: [], photoUrl: "https://example.invalid/qa.webp", images: [], reviews: [], packages: [], videos: [], city: "Bălți" });
const db = { select() {
  let table, condition;
  const rows = () => {
    const name = getTableName(table); calls.push(name);
    if (["artists", "venues"].includes(name)) {
      const query = dialect.sqlToQuery(condition);
      assert.match(query.sql, /"slug" = /); assert.match(query.sql, /"is_active" = /);
      assert.ok(query.params.includes("qa-fixture")); assert.ok(query.params.includes(true));
      return active ? [entity(name === "artists" ? "artist" : "venue")] : [];
    }
    return [];
  };
  const q = { from(t) { table = t; return q; }, where(c) { condition = c; return q; }, limit() { return q; }, orderBy() { return q; },
    then(a, b) { return Promise.resolve().then(rows).then(a, b); } };
  return q;
} };
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(root, "src/lib/db/index.ts")) return { db };
  if (request === "next/navigation") return { notFound() { throw Error("NEXT_NOT_FOUND"); }, permanentRedirect() { throw Error("Unexpected redirect"); } };
  if (phase === "pages" && resolved === path.join(root, "src/lib/db/queries/artists.ts")) return {
    getArtistBySlug: async () => entity("artist"), getSimilarArtists: async () => { extras++; return []; }, getUgcPhotosForArtist: async () => { extras++; return []; },
  };
  if (phase === "pages" && resolved === path.join(root, "src/lib/db/queries/venues.ts")) return {
    getVenueBySlug: async () => entity("venue"), getVenues: async () => { extras++; return { items: [] }; },
  };
  if (resolved === path.join(root, "src/app/[locale]/(public)/artisti/[slug]/client.tsx")) return { ArtistDetailClient: ({ artist }) => React.createElement("div", { "data-profile": "artist" }, artist.nameRo) };
  if (resolved === path.join(root, "src/app/[locale]/(public)/sali/[slug]/client.tsx")) return { VenueDetailClient: ({ venue }) => React.createElement("div", { "data-profile": "venue" }, venue.nameRo) };
  if (resolved === path.join(root, "src/components/public/view-tracker.tsx")) return { ViewTracker: () => null };
  return previousLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const artists = require("../src/lib/db/queries/artists");
    const venues = require("../src/lib/db/queries/venues");
    for (const [kind, query] of [["artist", artists.getArtistBySlug], ["venue", venues.getVenueBySlug]]) {
      active = false; calls = [];
      assert.equal(await query("qa-fixture"), null);
      assert.deepEqual(calls, [kind === "artist" ? "artists" : "venues"], "inactive profiles never load media, prices or reviews");
      active = true; assert.equal((await query("qa-fixture")).isActive, true);
      console.log(`PASS ${kind}: exact slug + active SQL predicate, inactive short-circuit, published profile retained`);
    }
    phase = "pages";
    const artistPage = require("../src/app/[locale]/(public)/artisti/[slug]/page");
    const venuePage = require("../src/app/[locale]/(public)/sali/[slug]/page");
    for (const [kind, page] of [["artist", artistPage], ["venue", venuePage]]) {
      assert.equal(page.revalidate, 0, "publication is checked each request, not hourly ISR");
      for (const locale of ["ro", "ru", "en"]) {
        const props = { params: Promise.resolve({ locale, slug: "qa-fixture" }) };
        active = false; extras = 0;
        await assert.rejects(page.default(props), /NEXT_NOT_FOUND/);
        const metadata = await page.generateMetadata(props);
        assert.deepEqual(metadata, { robots: { index: false, follow: false } });
        assert.equal(extras, 0, "no related data queried for an inactive page");
        assert.ok(!JSON.stringify(metadata).includes(`QA ${kind}`));
        active = true;
        const html = renderToStaticMarkup(await page.default(props));
        assert.ok(html.includes(`QA ${kind}`)); assert.ok(html.includes(`data-profile="${kind}"`));
        assert.ok(JSON.stringify(await page.generateMetadata(props)).includes(`QA ${kind}`));
      }
      console.log(`PASS ${kind}: RO/RU/EN inactive page notFound + noindex without profile data; published page/metadata render`);
    }
    console.log("4 public profile regression groups passed; zero external operations");
  } finally { Module._load = previousLoad; global.fetch = previousFetch; global.React = previousReact; }
})().catch(error => { console.error(error); process.exitCode = 1; });
