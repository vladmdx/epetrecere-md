/** Real erasure helper and HTTP handlers; all DB/Blob/Clerk operations are in-memory doubles. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const root = path.resolve(__dirname, "..");
const previousLoad = Module._load, previousFetch = global.fetch;
const keys = ["BLOB_READ_WRITE_TOKEN", "MOMENTS_BLOB_READ_WRITE_TOKEN"].map(key => [key, process.env[key]]);
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_fixture_test-public-only";
process.env.MOMENTS_BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_fixture_test-private-only";
global.fetch = async () => { throw Error("External HTTP forbidden"); };
const dialect = new PgDialect();
const plan = { id: 99, userId: "qa-owner", momentsSlug: "qa-slug" };
const urlFor = id => `https://fixture.private.blob.vercel-storage.com/event-photos/99/${id}.webp`;
const photo = id => ({ id, planId: 99, url: urlFor(id), deviceId: "qa-device" });
let state;
function reset(extra = {}) {
  state = { photos: [photo(500)], blobs: new Set([urlFor(500)]), failed: new Set(), listFail: false, allowed: true,
    lists: [], dels: [], removed: [], parentDeleted: false, userDeleted: false, clerkDeleted: false,
    updates: [], tx: false, locks: [], injectConcurrent: false, vendorMedia: null, ...extra };
}
const blob = {
  list: async options => {
    assert.equal(state.tx, false, "no Blob I/O while DB transaction holds locks");
    assert.ok(options.abortSignal); state.lists.push(options.prefix);
    if (state.listFail) throw Error("Synthetic outage");
    return { blobs: [...state.blobs].filter(url => new URL(url).pathname.slice(1).startsWith(options.prefix))
      .map(url => ({ url: state.sdkMixedCase ? url.replace("fixture.", "FiXtUrE.") : url, pathname: new URL(url).pathname.slice(1), size: 1 })).slice(0, 1), hasMore: false };
  },
  del: async (url, options) => {
    assert.equal(state.tx, false); assert.ok(options.abortSignal); state.dels.push(url);
    if (state.failed.has(url)) throw Error("Synthetic delete failure");
    state.blobs.delete(url);
  },
};
const db = {
  select() {
    let table, condition, cap = Infinity, lock = false;
    const rows = () => {
      const name = getTableName(table), query = dialect.sqlToQuery(condition);
      if (lock) {
        assert.equal(state.tx, true); state.locks.push(name);
        if (name === "event_plans" && state.injectConcurrent) { state.photos.push(photo(999)); state.blobs.add(urlFor(999)); state.injectConcurrent = false; }
      }
      if (name === "users") return state.userDeleted ? [] : [{ id: "qa-owner", clerkId: "qa-clerk", email: "qa@example.invalid" }];
      if (name === "event_plans") return state.parentDeleted ? [] : [plan];
      if (state.vendorMedia && name in state.vendorMedia) return state.vendorMedia[name];
      if (name === "event_photos") {
        assert.ok(query.params.includes(99) || query.params.includes("qa-slug") || query.params.includes(500));
        const specific = query.params.find(p => Number.isInteger(p) && p !== 99);
        return state.photos.filter(p => specific ? p.id === specific : true).slice(0, cap);
      }
      return [];
    };
    const q = { from(t) { table = t; return q; }, innerJoin() { return q; }, where(c) { condition = c; return q; }, orderBy() { return q; },
      limit(n) { cap = n; return q; }, for(value) { assert.equal(value, "update"); lock = true; return q; }, then(a, b) { return Promise.resolve().then(rows).then(a, b); } };
    return q;
  },
  delete(table) { return { where(condition) {
    const name = getTableName(table), { params } = dialect.sqlToQuery(condition);
    if (name === "event_photos") {
      assert.ok(params.includes(99)); const id = params.find(p => Number.isInteger(p) && p !== 99);
      const row = state.photos.find(p => p.id === id);
      if (row) { assert.ok(params.includes(row.url), "only exact erased URL row is removed"); state.photos = state.photos.filter(p => p.id !== id); state.removed.push(id); }
    }
    if (name === "event_plans" || name === "users") {
      assert.equal(state.tx, true); assert.equal(state.photos.length, 0, "cascade never loses unprocessed provenance");
      assert.ok(state.locks.includes("event_plans"));
      if (name === "users") { assert.ok(state.locks.includes("users")); state.userDeleted = true; }
      state.parentDeleted = true;
    }
    if (state.vendorMedia && name in state.vendorMedia) {
      assert.equal(state.tx, true); state.vendorMedia[name] = [];
    }
    return Promise.resolve();
  } }; },
  update(table) { return { set(values) { return { where: async () => {
    const name = getTableName(table); assert.equal(state.tx, true); state.updates.push(name);
    if (state.vendorMedia && name in state.vendorMedia) state.vendorMedia[name] = state.vendorMedia[name].map(row => ({ ...row, ...values }));
  } }; } }; },
  execute: async query => { assert.match(dialect.sqlToQuery(query).sql, /SET LOCAL (lock_timeout|statement_timeout)/); },
  transaction: async fn => { assert.equal(state.tx, false); state.tx = true; try { return await fn(db); } finally { state.tx = false; } },
};
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@vercel/blob") return blob;
  if (request === "@clerk/nextjs/server") return { auth: async () => ({ userId: state.allowed ? "qa-clerk" : null }), clerkClient: async () => ({ users: { deleteUser: async id => { assert.equal(id, "qa-clerk"); assert.equal(state.userDeleted, true); state.clerkDeleted = true; } } }) };
  if (request === "@/lib/db" || resolved === path.join(root, "src/lib/db/index.ts")) return { db };
  if (resolved === path.join(root, "src/lib/planner/ownership.ts")) return { requirePlanOwnership: async id => { assert.equal(id, 99); return state.allowed ? { ok: true, userId: "qa-owner", plan } : { ok: false, status: 403, error: "Forbidden" }; } };
  if (resolved === path.join(root, "src/lib/auth/admin.ts")) return { requireAdmin: async () => state.allowed ? { ok: true } : { ok: false, status: 403, error: "Forbidden" } };
  if (resolved === path.join(root, "src/lib/moments/access.ts")) return { requestHasMomentsAccess: () => state.allowed };
  if (resolved === path.join(root, "src/lib/rate-limit.ts")) return { rateLimit: async () => ({ success: true }) };
  if (resolved === path.join(root, "src/lib/privacy/guest-encryption.ts")) return { revealGuestListRecord: row => row };
  if (resolved === path.join(root, "src/lib/vendors/revalidate.ts")) return { revalidateVendorCatalog() {} };
  return previousLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const erasure = require("../src/lib/moments/erase-photo");
    const owner = require("../src/app/api/event-plans/[id]/photos/[photoId]/route");
    const guest = require("../src/app/api/moments/[slug]/photos/[photoId]/route");
    const admin = require("../src/app/api/admin/event-photos/[id]/route");
    const planRoute = require("../src/app/api/event-plans/[id]/route");
    const account = require("../src/app/api/me/delete-account/route");
    const ctx = { params: Promise.resolve({ id: "99", photoId: "500", slug: "qa-slug" }) };
    const request = () => new Request("https://example.invalid", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: "qa-device" }) });

    reset({ blobs: new Set() });
    assert.equal(await erasure.eraseManagedPhoto(urlFor(500), plan), "already_missing");
    assert.equal(state.dels.length, 0); assert.equal(state.lists.length, 1);
    for (const url of [urlFor(500).replace("fixture.private", "foreign.private"), urlFor(500).replace("/99/", "/100/"), "https://fixture.public.blob.vercel-storage.com/uploads/legacy.jpg", "http://127.0.0.1/metadata"]) {
      reset({ blobs: new Set() }); assert.equal(await erasure.eraseManagedPhoto(url, plan), "unverified"); assert.equal(state.lists.length + state.dels.length, 0);
    }
    reset({ listFail: true }); assert.equal(await erasure.eraseManagedPhoto(urlFor(500), plan), "retry");
    assert.equal(state.dels.length, 0);
    reset({ sdkMixedCase: true }); assert.equal(await erasure.eraseManagedPhoto(urlFor(500), plan), "deleted");
    assert.deepEqual(state.dels, [urlFor(500)], "SDK host casing is normalized, deletion uses the canonical verified URL");
    console.log("PASS already-missing requires successful exact-store listing; foreign, wrong-plan, generic legacy and outage never authorize erasure");

    for (const [handler, context] of [[owner, ctx], [guest, ctx], [admin, { params: Promise.resolve({ id: "500" }) }]]) {
      reset({ failed: new Set([urlFor(500)]) });
      const failed = await handler.DELETE(request(), context);
      assert.equal(failed.status, 503); assert.equal((await failed.json()).retryable, true);
      assert.equal(state.photos.length, 1); assert.equal(state.removed.length, 0);
      state.failed.clear(); state.blobs.clear(); // Simulate ACK lost after a storage success.
      assert.equal((await handler.DELETE(request(), context)).status, 200);
      assert.equal(state.photos.length, 0);
      reset({ photos: [{ ...photo(500), url: "https://foreign.private.blob.vercel-storage.com/event-photos/99/500.webp" }] });
      assert.equal((await handler.DELETE(request(), context)).status, 409);
      assert.equal(state.photos.length, 1); assert.equal(state.dels.length, 0);
    }
    console.log("PASS owner/guest/admin failures retain exact row, retry missing object completes, foreign reference requires review");

    const batch = Array.from({ length: 21 }, (_, i) => photo(500 + i));
    reset({ photos: batch, blobs: new Set(batch.map(p => p.url)) });
    assert.equal((await planRoute.DELETE(request(), ctx)).status, 503);
    assert.equal(state.removed.length, 20); assert.equal(state.photos.length, 1); assert.equal(state.parentDeleted, false);
    assert.equal((await planRoute.DELETE(request(), ctx)).status, 200);
    assert.equal(state.photos.length, 0); assert.equal(state.parentDeleted, true);
    reset({ injectConcurrent: true });
    assert.equal((await planRoute.DELETE(request(), ctx)).status, 503);
    assert.deepEqual(state.photos.map(p => p.id), [999]); assert.equal(state.parentDeleted, false);
    console.log("PASS plan deletion progresses in bounded batches and final locked recheck preserves concurrent upload");

    reset({ failed: new Set([urlFor(500)]) });
    assert.equal((await account.DELETE()).status, 503);
    assert.equal(state.photos.length, 1); assert.equal(state.userDeleted, false); assert.equal(state.clerkDeleted, false); assert.deepEqual(state.updates, []);
    state.failed.clear(); state.blobs.clear();
    assert.equal((await account.DELETE()).status, 200);
    assert.equal(state.photos.length, 0); assert.equal(state.userDeleted, true); assert.equal(state.clerkDeleted, true);
    const vendorMedia = {
      artists: [{ id: 561, photoUrl: "https://fixture.public.blob.vercel-storage.com/artist-cover.jpg" }],
      venues: [{ id: 24, menuPdfUrl: "https://fixture.public.blob.vercel-storage.com/menu.pdf", ogImageUrl: "https://fixture.public.blob.vercel-storage.com/venue-cover.jpg" }],
      artist_images: [{ url: "https://fixture.public.blob.vercel-storage.com/artist-gallery.jpg" }],
      venue_images: [{ url: "https://fixture.public.blob.vercel-storage.com/venue-gallery.jpg" }],
      artist_videos: [{ url: "https://example.invalid/vendor-video" }],
    };
    reset({ injectConcurrent: true, vendorMedia: structuredClone(vendorMedia) });
    assert.equal((await account.DELETE()).status, 503);
    assert.equal(state.userDeleted, false); assert.equal(state.clerkDeleted, false); assert.equal(state.photos.length, 1);
    assert.deepEqual(state.vendorMedia, vendorMedia, "concurrent photo retry preserves all vendor URL fields and media rows");
    assert.deepEqual(state.updates, [], "no minimization before final locked photo recheck");
    console.log("PASS account storage cleanup precedes all mutation/cascade/Clerk deletion, with parent locks and final concurrent-photo guard");

    let now = 0, removed = 0;
    const result = await erasure.erasePhotoBatch(batch.map(p => ({ ...p, plan })), async () => { removed++; now += 13_000; }, { now: () => now, erase: async () => "deleted" });
    assert.equal(result.complete, false); assert.equal(result.reason, "remaining"); assert.equal(removed, 1);
    const dbFailure = await erasure.erasePhotoBatch([{ ...photo(500), plan }], async () => { throw Error("Synthetic DB failure"); }, { erase: async () => "already_missing" });
    assert.equal(dbFailure.complete, false); assert.equal(dbFailure.reason, "retry"); assert.equal(dbFailure.removed, 0);
    console.log("PASS deadline and DB failure remain resumable without discarding unprocessed provenance");
    console.log("5 erasure regression groups passed; zero external operations");
  } finally {
    Module._load = previousLoad; global.fetch = previousFetch;
    for (const [key, value] of keys) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
