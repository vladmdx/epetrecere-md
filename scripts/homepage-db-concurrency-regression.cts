/** Homepage database scheduling regression tests. No database or HTTP calls. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const { PgDialect } = require("drizzle-orm/pg-core");
const React = require("react");

const root = path.resolve(__dirname, "..");
const oldLoad = Module._load;
const oldFetch = global.fetch;
const dialect = new PgDialect();

let execute = async () => {
  throw new Error("Unexpected database call");
};
const db = {
  execute(query) {
    return execute(query);
  },
};

function resolved(request, parent) {
  try {
    return Module._resolveFilename(request, parent);
  } catch {
    return null;
  }
}

async function testSupplyCounts() {
  Module._load = function(request, parent, isMain) {
    if (
      request === "@/lib/db" ||
      resolved(request, parent) === path.join(root, "src/lib/db/index.ts")
    ) {
      return { db };
    }
    return oldLoad.call(this, request, parent, isMain);
  };

  const { getSupplyCounts } = require("../src/lib/db/queries/supply-counts");
  const queries = [];
  execute = async (query) => {
    queries.push(dialect.sqlToQuery(query));
    return {
      rows: [{
        activeArtists: "7",
        activeVenues: 4,
        serviceCategories: "29",
        completedRequests: 11,
        bySlug: { formatii: "3", dj: 2 },
      }],
    };
  };

  const counts = await getSupplyCounts();
  assert.equal(queries.length, 1, "all homepage counters share one DB statement");
  assert.equal(queries[0].params.length, 0);
  assert.match(queries[0].sql, /WITH category_counts AS/i);
  for (const table of ["artists", "venues", "categories", "booking_requests", "users"]) {
    assert.match(queries[0].sql, new RegExp(`"${table}"`));
  }
  assert.deepEqual(counts, {
    categories: { venues: 4, bands: 3, dj: 2, photo: 0, hosts: 0, decor: 0 },
    bySlug: { formatii: 3, dj: 2 },
    activeArtists: 7,
    activeVenues: 4,
    serviceCategories: 29,
    completedRequests: 11,
  });

  execute = async () => {
    throw new Error("statement timeout");
  };
  assert.deepEqual(await getSupplyCounts(), {
    categories: {},
    bySlug: {},
    activeArtists: 0,
    activeVenues: 0,
    serviceCategories: 0,
    completedRequests: 0,
  });
  console.log("PASS supply counts use one statement and preserve the zero-data fallback");
}

async function testHomepageScheduling() {
  let active = 0;
  let maxActive = 0;
  let sequence = [];
  let failures = new Set();

  const fetcher = (name, value) => async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    sequence.push(`${name}:start`);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      if (failures.has(name)) throw new Error(`${name} unavailable`);
      return value;
    } finally {
      sequence.push(`${name}:end`);
      active--;
    }
  };

  const componentMocks = {
    "@/components/public/sections/hero": { HeroSection: () => null },
    "@/components/public/sections/feature-highlights": { FeatureHighlightsSection: () => null },
    "@/components/public/sections/categories": { CategoriesSection: () => null },
    "@/components/public/sections/featured-artists": { FeaturedArtistsSection: () => null },
    "@/components/public/sections/featured-venues": { FeaturedVenuesSection: () => null },
    "@/components/public/sections/process": { ProcessSection: () => null },
    "@/components/public/sections/community": { CommunitySection: () => null },
    "@/components/public/sections/cta": { CTASection: () => null },
    "@/components/shared/floating-cta": { FloatingCTA: () => null },
  };
  const artists = fetcher("artists", []);
  const venues = fetcher("venues", []);
  const supply = fetcher("supply", {
    categories: {}, bySlug: {}, activeArtists: 0, activeVenues: 0,
    serviceCategories: 0, completedRequests: 0,
  });

  Module._load = function(request, parent, isMain) {
    if (componentMocks[request]) return componentMocks[request];
    if (request === "@/lib/privacy/public-catalog") return { publicCatalogData: (value) => value };
    if (request === "@/lib/db/queries/artists") return { getFeaturedArtists: artists };
    if (request === "@/lib/db/queries/venues") return { getFeaturedVenues: venues };
    if (request === "@/lib/db/queries/supply-counts") return { getSupplyCounts: supply };
    if (request === "@/lib/seo/jsonld") {
      return { websiteJsonLd: () => ({}), organizationJsonLd: () => ({}), safeJsonLd: () => "{}" };
    }
    if (request === "@/lib/seo/page-meta") return { metaForPath: () => ({}) };
    if (request === "@/lib/i18n/routing") {
      return { DEFAULT_LOCALE: "ro", isLocale: () => true };
    }
    return oldLoad.call(this, request, parent, isMain);
  };

  const pagePath = path.join(root, "src/app/[locale]/(public)/page.tsx");
  delete require.cache[require.resolve(pagePath)];
  const HomePage = require(pagePath).default;
  await HomePage();
  assert.equal(maxActive, 1, "homepage must never overlap its DB-backed fetchers");
  assert.deepEqual(sequence, [
    "artists:start", "artists:end",
    "venues:start", "venues:end",
    "supply:start", "supply:end",
  ]);

  active = 0;
  maxActive = 0;
  sequence = [];
  failures = new Set(["artists"]);
  await HomePage();
  assert.equal(maxActive, 1);
  assert.deepEqual(sequence, [
    "artists:start", "artists:end",
    "venues:start", "venues:end",
    "supply:start", "supply:end",
  ], "an optional fetch failure must not skip the later serial fallbacks");
  console.log("PASS homepage DB fetchers are serial and retain independent fallbacks");
}

function testStaticPoolGuard() {
  const dbSource = readFileSync(path.join(root, "src/lib/db/index.ts"), "utf8");
  const pageSource = readFileSync(path.join(root, "src/app/[locale]/(public)/page.tsx"), "utf8");
  const countsSource = readFileSync(path.join(root, "src/lib/db/queries/supply-counts.ts"), "utf8");
  assert.match(dbSource, /max:\s*isBuild\s*\?\s*4\s*:\s*2/);
  assert.doesNotMatch(
    dbSource,
    /max_pipeline\s*:/,
    "postgres.js 3.4.9 uses its pipeline boundary for the BEGIN reservation hook",
  );
  assert.doesNotMatch(pageSource, /Promise\.all\s*\(/);
  assert.doesNotMatch(countsSource, /Promise\.all\s*\(/);
  assert.equal((countsSource.match(/db\.execute/g) ?? []).length, 1);
  console.log("PASS pool limits, transaction-safe defaults, and no-burst source guards are pinned");
}

global.fetch = async () => {
  throw new Error("External HTTP forbidden");
};
global.React = React;

(async () => {
  try {
    await testSupplyCounts();
    await testHomepageScheduling();
    testStaticPoolGuard();
    console.log("3 homepage database concurrency regression groups passed; zero external operations");
  } finally {
    Module._load = oldLoad;
    global.fetch = oldFetch;
    delete global.React;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
