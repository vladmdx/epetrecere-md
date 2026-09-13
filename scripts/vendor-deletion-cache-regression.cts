/** Real DELETE handlers with in-memory DB/auth/cache doubles. No database,
 * Clerk request, browser, Blob deletion or external notification is possible. */
/* eslint-disable @typescript-eslint/no-require-imports -- this isolated CommonJS regression test intercepts module loading. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const { NextRequest } = require("next/server");
const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
const dialect = new PgDialect();
delete process.env.BLOB_READ_WRITE_TOKEN;
global.fetch = async () => { throw Error("External HTTP forbidden in deletion regression"); };
let state;
const reset = (overrides = {}) => {
  state = { signedIn: true, role: "admin", userExists: true, artistExists: true,
    venueExists: true, ownedKinds: [], failDelete: false, inTx: false, trace: [], ...overrides };
};
reset();
const db = {
  select() {
    let table;
    const rows = () => {
      const name = getTableName(table);
      if (name === "users") return state.userExists ? [{ id: "qa-private-id", clerkId: "qa-private-clerk", role: state.role, email: "qa@example.invalid" }] : [];
      if (name === "artists") return state.artistExists
        && (state.ownedKinds.includes("artist") || !state.accountDelete)
        ? [{ id: 101, nameRo: "QA Artist", slug: "qa-artist", isActive: true, photoUrl: null }]
        : [];
      if (name === "venues") return state.venueExists && (state.ownedKinds.includes("venue") || !state.accountDelete)
        ? [{ id: 202, slug: "qa-venue", isActive: true, isFeatured: true, menuPdfUrl: null, ogImageUrl: null }]
        : [];
      return [];
    };
    const builder = { from(value) { table = value; return builder; }, innerJoin() { return builder; }, where() { return builder; }, limit() { return Promise.resolve(rows()); },
      for(value) { assert.equal(value, "update"); assert.equal(state.inTx, true); state.trace.push(`lock:${getTableName(table)}`); return builder; },
      then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); } };
    return builder;
  },
  update(table) { return { set() { return { where: async () => {
    if (state.accountDelete) assert.equal(state.inTx, true, "account minimization remains in the atomic erasure transaction");
    state.trace.push(`update:${getTableName(table)}`);
  } }; } }; },
  delete(table) {
    const name = getTableName(table);
    let executed = false;
    const execute = async () => {
      if (state.failDelete) throw Error("synthetic delete failure");
      if (state.accountDelete) assert.equal(state.inTx, true);
      if (!executed) state.trace.push(`delete:${name}`);
      executed = true;
      return name === "artists" && state.artistExists
        ? [{ id: 101, slug: "qa-artist", isActive: true }]
        : [];
    };
    const builder = { where() { return builder; }, returning: execute, then(resolve, reject) { return execute().then(resolve, reject); } };
    return builder;
  },
  execute: async query => {
    assert.equal(state.inTx, true);
    const statement = dialect.sqlToQuery(query).sql;
    assert.match(
      statement,
      /SET LOCAL (lock_timeout|statement_timeout)|select pg_advisory_xact_lock/,
    );
    if (statement.includes("pg_advisory_xact_lock")) {
      state.trace.push("lock:legal-scope");
    }
  },
  transaction: async callback => {
    assert.equal(state.inTx, false);
    const before = [...state.trace];
    state.inTx = true; state.trace.push("tx:begin");
    try {
      const result = await callback(db);
      state.trace.push("tx:commit"); return result;
    } catch (error) {
      state.trace = [...before, "tx:rollback"]; throw error;
    } finally { state.inTx = false; }
  },
};
Module._load = function(request, parent, isMain) {
  if (request === "@clerk/nextjs/server") return {
    auth: async () => ({ userId: state.signedIn ? "qa-private-clerk" : null }),
    clerkClient: async () => ({ users: { deleteUser: async id => { assert.equal(id, "qa-private-clerk"); state.trace.push("delete:clerk"); } } }),
  };
  if (request === "next/cache") return { revalidatePath: (route, type) => {
    assert.equal(type, undefined, "concrete paths omit Next's dynamic-route type");
    assert.equal(state.inTx, false, "cache invalidation waits for commit"); state.trace.push(`cache:${route}`);
  } };
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(root, "src/lib/db/index.ts")) return { db };
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const artist = require("../src/app/api/artists/crud/route");
    const venue = require("../src/app/api/venues/[id]/route");
    const account = require("../src/app/api/me/delete-account/route");
    const request = id => new NextRequest(`https://example.invalid/api/artists/crud?id=${id}`, { method: "DELETE" });
    const invoke = (kind, id = "101") => kind === "artist" ? artist.DELETE(request(id)) : venue.DELETE(request(id), { params: Promise.resolve({ id }) });
    let checks = 0;
    const passed = label => { checks++; console.log("PASS", label); };
    for (const kind of ["artist", "venue"]) {
      reset();
      assert.equal((await invoke(kind)).status, 200);
      const deleted = state.trace.indexOf(`delete:${kind === "artist" ? "artists" : "venues"}`);
      if (kind === "artist") {
        const snapshotted = state.trace.indexOf("update:booking_requests");
        assert.ok(
          snapshotted >= 0 && snapshotted < deleted,
          "artist booking identity is snapshotted before profile deletion",
        );
      }
      const cached = state.trace.findIndex(entry => entry.startsWith("cache:"));
      assert.ok(deleted >= 0 && cached > deleted, "cache expires only after deletion succeeds");
      const directory = kind === "artist" ? "artisti" : "sali";
      const slug = kind === "artist" ? "qa-artist" : "qa-venue";
      const cache = state.trace.filter(entry => entry.startsWith("cache:"));
      assert.equal(cache.length, 16);
      for (const route of [
        `cache:/${directory}/${slug}`,
        `cache:/ro/${directory}/${slug}`,
        `cache:/ru/${directory}/${slug}`,
        `cache:/en/${directory}/${slug}`,
        `cache:/${directory}`,
        `cache:/servicii`,
        `cache:/`,
      ]) assert.ok(cache.includes(route), `missing precise cache target ${route}`);
      assert.ok(cache.every(entry => !entry.includes("[") && !entry.includes("(public)")));
      passed(`${kind}: successful delete expires exact profile, directory, homepage and supply paths`);

      for (const gate of [{ signedIn: false }, { role: "user" }]) {
        reset(gate); assert.equal((await invoke(kind)).status, gate.role ? 403 : 401); assert.deepEqual(state.trace, []);
      }
      passed(`${kind}: anonymous/non-admin calls never delete or invalidate`);

      for (const id of ["0", "-1", "1.5", "NaN", "9007199254740992"]) {
        reset(); assert.equal((await invoke(kind, id)).status, 400); assert.deepEqual(state.trace, []);
      }
      passed(`${kind}: malformed IDs never reach a deletion`);

      reset(kind === "artist" ? { artistExists: false } : { venueExists: false });
      assert.equal((await invoke(kind)).status, 404); assert.ok(!state.trace.some(entry => entry.startsWith("cache:")));
      reset({ failDelete: true }); await assert.rejects(() => invoke(kind), /synthetic delete failure/);
      assert.ok(!state.trace.some(entry => entry.startsWith("cache:")));
      passed(`${kind}: missing or failed deletion never reports a cache refresh`);
    }

    for (const ownedKinds of [[], ["artist"], ["venue"], ["artist", "venue"]]) {
      reset({ ownedKinds, accountDelete: true });
      assert.equal((await account.DELETE()).status, 200);
      assert.ok(state.trace.includes("lock:legal-scope"), "account erasure is serialized with membership/signing mutations");
      const cache = state.trace.filter(entry => entry.startsWith("cache:"));
      assert.equal(cache.length, ownedKinds.length * 16);
      for (const kind of ownedKinds) {
        const route = `cache:/${kind === "artist" ? "artisti/qa-artist" : "sali/qa-venue"}`;
        assert.ok(state.trace.indexOf(route) > state.trace.indexOf(`update:${kind === "artist" ? "artists" : "venues"}`));
        assert.ok(state.trace.indexOf(route) > state.trace.indexOf("delete:users"), "catalog refresh follows atomic local account erasure");
        assert.ok(state.trace.indexOf(route) > state.trace.indexOf("tx:commit"), "rolled-back minimization must never invalidate catalog pages");
        assert.ok(state.trace.indexOf(route) < state.trace.indexOf("delete:clerk"), "local catalog erasure is visible before external identity cleanup");
      }
      assert.ok(cache.every(entry => !entry.includes("[") && !entry.includes("(public)")));
      assert.ok(!state.trace.some(entry => entry.includes("legal_acceptances")), "signed evidence is never altered");
      assert.ok(state.trace.includes("delete:clerk"));
      passed(`account: ${ownedKinds.join("+") || "client-only"} invalidates only owned catalogs and preserves signed evidence`);
    }
    reset({ signedIn: false }); assert.equal((await account.DELETE()).status, 401); assert.deepEqual(state.trace, []);
    passed("account: anonymous request is read-only and rejected");
    reset({ ownedKinds: ["artist", "venue"], accountDelete: true, failDelete: true });
    assert.equal((await account.DELETE()).status, 503);
    assert.ok(state.trace.includes("tx:rollback"));
    assert.ok(!state.trace.some(entry => /^(cache:|update:|delete:)/.test(entry)), "failed atomic erasure leaves no minimization, catalog refresh or Clerk deletion");
    passed("account: failed local erasure rolls back and never invalidates catalogs or deletes Clerk identity");
    console.log(`${checks} deletion/cache regression checks passed; zero external operations`);
  } finally {
    Module._load = originalLoad; global.fetch = originalFetch;
    if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
