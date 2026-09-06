/** Real DELETE handlers with in-memory DB/auth/cache doubles. No database,
 * Clerk request, browser, Blob deletion or external notification is possible. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { getTableName } = require("drizzle-orm");
const { NextRequest } = require("next/server");
const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_READ_WRITE_TOKEN;
global.fetch = async () => { throw Error("External HTTP forbidden in deletion regression"); };
let state;
const reset = (overrides = {}) => {
  state = { signedIn: true, role: "admin", userExists: true, artistExists: true,
    venueExists: true, ownedKinds: [], failDelete: false, trace: [], ...overrides };
};
reset();
const db = {
  select() {
    let table;
    const rows = () => {
      const name = getTableName(table);
      if (name === "users") return state.userExists ? [{ id: "qa-private-id", clerkId: "qa-private-clerk", role: state.role, email: "qa@example.invalid" }] : [];
      if (name === "artists") return state.ownedKinds.includes("artist") ? [{ id: 101, photoUrl: null }] : [];
      if (name === "venues") return state.venueExists && (state.ownedKinds.includes("venue") || !state.accountDelete) ? [{ id: 202, menuPdfUrl: null, ogImageUrl: null }] : [];
      return [];
    };
    const builder = { from(value) { table = value; return builder; }, where() { return builder; }, limit() { return Promise.resolve(rows()); }, then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); } };
    return builder;
  },
  update(table) { return { set() { return { where: async () => { state.trace.push(`update:${getTableName(table)}`); } }; } }; },
  delete(table) {
    const name = getTableName(table);
    let executed = false;
    const execute = async () => {
      if (state.failDelete) throw Error("synthetic delete failure");
      if (!executed) state.trace.push(`delete:${name}`);
      executed = true;
      return name === "artists" && state.artistExists ? [{ id: 101 }] : [];
    };
    const builder = { where() { return builder; }, returning: execute, then(resolve, reject) { return execute().then(resolve, reject); } };
    return builder;
  },
};
Module._load = function(request, parent, isMain) {
  if (request === "@clerk/nextjs/server") return {
    auth: async () => ({ userId: state.signedIn ? "qa-private-clerk" : null }),
    clerkClient: async () => ({ users: { deleteUser: async id => { assert.equal(id, "qa-private-clerk"); state.trace.push("delete:clerk"); } } }),
  };
  if (request === "next/cache") return { revalidatePath: (route, type) => { assert.equal(type, "page"); state.trace.push(`cache:${route}`); } };
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
      const cached = state.trace.findIndex(entry => entry.startsWith("cache:"));
      assert.ok(deleted >= 0 && cached > deleted, "cache expires only after deletion succeeds");
      assert.equal(state.trace.filter(entry => entry.startsWith("cache:")).length, 5);
      assert.ok(state.trace.includes(`cache:/[locale]/(public)/${kind === "artist" ? "artisti" : "sali"}/[slug]`));
      passed(`${kind}: successful delete expires the matching catalog, profile, categories and homepage`);

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
      const cache = state.trace.filter(entry => entry.startsWith("cache:"));
      assert.equal(cache.length, ownedKinds.length * 5);
      for (const kind of ownedKinds) {
        const route = `cache:/[locale]/(public)/${kind === "artist" ? "artisti" : "sali"}/[slug]`;
        assert.ok(state.trace.indexOf(route) > state.trace.indexOf(`update:${kind === "artist" ? "artists" : "venues"}`));
        assert.ok(state.trace.indexOf(route) < state.trace.indexOf("delete:users"), "public minimization is visible even if later cleanup needs retry");
      }
      assert.ok(!state.trace.some(entry => entry.includes("legal_acceptances")), "signed evidence is never altered");
      assert.ok(state.trace.includes("delete:clerk"));
      passed(`account: ${ownedKinds.join("+") || "client-only"} invalidates only owned catalogs and preserves signed evidence`);
    }
    reset({ signedIn: false }); assert.equal((await account.DELETE()).status, 401); assert.deepEqual(state.trace, []);
    passed("account: anonymous request is read-only and rejected");
    console.log(`${checks} deletion/cache regression checks passed; zero external operations`);
  } finally {
    Module._load = originalLoad; global.fetch = originalFetch;
    if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
