/** Wishlist visibility regression tests. No database or HTTP calls. */
/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS loader mocks */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");

const root = path.resolve(__dirname, "..");
const oldLoad = Module._load;
const oldFetch = global.fetch;
const dialect = new PgDialect();

let state;

function reset(mode = "get") {
  state = {
    mode,
    inserts: [],
    queries: [],
  };
}

function resolved(request, parent) {
  try {
    return Module._resolveFilename(request, parent);
  } catch {
    return null;
  }
}

function compiledCondition(tableName, condition) {
  assert.ok(condition, `${tableName} query must be scoped`);
  const query = dialect.sqlToQuery(condition);
  state.queries.push({ tableName, ...query });
  return query;
}

function assertActivePredicate(query, tableName) {
  assert.match(
    query.sql,
    new RegExp(`"${tableName}"\\."is_active" = \\$\\d+`),
    `${tableName} query must enforce is_active = true itself`,
  );
  assert.ok(
    query.params.includes(true),
    `${tableName} active predicate must bind true`,
  );
}

const db = {
  select() {
    let table;
    let condition;
    let joinedVenue = false;

    const execute = () => {
      const tableName = getTableName(table);
      const query = compiledCondition(tableName, condition);

      if (tableName === "users") {
        return [{ id: "00000000-0000-4000-8000-000000000001" }];
      }
      if (tableName === "wishlist_items") {
        return [
          { entityType: "artist", entityId: 10, createdAt: new Date("2026-09-14T10:00:00Z") },
          { entityType: "artist", entityId: 11, createdAt: new Date("2026-09-14T09:00:00Z") },
          { entityType: "venue", entityId: 20, createdAt: new Date("2026-09-14T08:00:00Z") },
          { entityType: "venue", entityId: 21, createdAt: new Date("2026-09-14T07:00:00Z") },
        ];
      }
      if (tableName === "artists") {
        assertActivePredicate(query, "artists");
        if (state.mode === "post-inactive-artist") return [];
        if (state.mode === "post-active-artist") return [{ id: 10 }];
        return [{
          id: 10,
          nameRo: "Artist public",
          slug: "artist-public",
          coverImageUrl: null,
          priceFrom: 200,
          city: "Chișinău",
          categoryIds: [101, 102],
        }];
      }
      if (tableName === "venues") {
        assertActivePredicate(query, "venues");
        if (state.mode === "post-inactive-venue") return [];
        if (state.mode === "post-active-venue") return [{ id: 20 }];
        return [{
          id: 20,
          nameRo: "Local public",
          slug: "local-public",
          city: "Chișinău",
          pricePerPerson: 50,
        }];
      }
      if (tableName === "venue_images") {
        assert.equal(joinedVenue, true, "cover read must join venues atomically");
        assertActivePredicate(query, "venues");
        return [{ venueId: 20, url: "https://example.invalid/venue-cover.jpg" }];
      }
      if (tableName === "categories") {
        assertActivePredicate(query, "categories");
        return [{ id: 101, nameRo: "Foto", slug: "foto", type: "artist" }];
      }
      throw new Error(`Unexpected DB query: ${tableName}`);
    };

    const chain = {
      from(value) {
        table = value;
        return chain;
      },
      innerJoin() {
        joinedVenue = true;
        return chain;
      },
      where(value) {
        condition = value;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit() {
        return chain;
      },
      then(resolve, reject) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };
    return chain;
  },
  insert(table) {
    const tableName = getTableName(table);
    const chain = {
      values(value) {
        state.inserts.push({ tableName, value });
        return chain;
      },
      onConflictDoNothing() {
        return Promise.resolve();
      },
    };
    return chain;
  },
};

Module._load = function(request, parent, isMain) {
  if (
    request === "@/lib/db" ||
    resolved(request, parent) === path.join(root, "src/lib/db/index.ts")
  ) {
    return { db };
  }
  if (request === "@clerk/nextjs/server") {
    return { auth: async () => ({ userId: "clerk-wishlist-qa" }) };
  }
  return oldLoad.call(this, request, parent, isMain);
};

global.fetch = async () => {
  throw new Error("External HTTP forbidden");
};

function postRequest(entityType, entityId) {
  return new Request("https://example.invalid/api/wishlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityType, entityId }),
  });
}

(async () => {
  try {
    const { GET, POST } = require("../src/app/api/wishlist/route");

    reset("get");
    const getResponse = await GET();
    assert.equal(getResponse.status, 200);
    const getBody = await getResponse.json();
    assert.deepEqual(
      getBody.items.map((item) => [item.entityType, item.entityId]),
      [["artist", 10], ["venue", 20]],
      "inactive saved artists and venues must disappear from GET",
    );
    assert.deepEqual(
      getBody.items[0].categories,
      [{ id: 101, name: "Foto", slug: "foto" }],
      "inactive category 102 must not be disclosed through an active artist",
    );
    assert.equal(state.inserts.length, 0);
    console.log("PASS GET hides inactive entities and inactive artist categories");

    reset("post-inactive-artist");
    const inactiveArtist = await POST(postRequest("artist", 11));
    assert.equal(inactiveArtist.status, 404);
    assert.equal(state.inserts.length, 0);

    reset("post-inactive-venue");
    const inactiveVenue = await POST(postRequest("venue", 21));
    assert.equal(inactiveVenue.status, 404);
    assert.equal(state.inserts.length, 0);
    console.log("PASS POST rejects inactive artists and venues without inserting");

    reset("post-category");
    const category = await POST(postRequest("category", 101));
    assert.equal(category.status, 400);
    assert.equal(state.inserts.length, 0);
    assert.equal(
      state.queries.filter((query) => query.tableName !== "users").length,
      0,
      "invalid category entity must fail before any entity lookup",
    );
    console.log("PASS POST does not accept categories as wishlist entities");

    reset("post-active-artist");
    const activeArtist = await POST(postRequest("artist", 10));
    assert.equal(activeArtist.status, 200);
    assert.deepEqual(state.inserts, [{
      tableName: "wishlist_items",
      value: {
        userId: "00000000-0000-4000-8000-000000000001",
        entityType: "artist",
        entityId: 10,
      },
    }]);
    console.log("PASS POST preserves idempotent insertion for an active entity");

    console.log("4 wishlist public-visibility regression groups passed; zero external operations");
  } finally {
    Module._load = oldLoad;
    global.fetch = oldFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
