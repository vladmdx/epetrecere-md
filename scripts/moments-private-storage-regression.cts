/** Actual file route and storage helper with isolated in-memory doubles only. */
/* eslint-disable @typescript-eslint/no-require-imports -- deliberate CommonJS mock boundary */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const { getTableName } = require("drizzle-orm");
const project = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalPrivate = process.env.MOMENTS_BLOB_READ_WRITE_TOKEN;
const originalPublic = process.env.BLOB_READ_WRITE_TOKEN;
process.env.MOMENTS_BLOB_READ_WRITE_TOKEN = "test-private-no-network";
process.env.BLOB_READ_WRITE_TOKEN = "test-public-no-network";
const privateUrl = "https://fixture.private.blob.vercel-storage.com/event-photos/99/owned.webp";
const legacyUrl = "https://fixture.public.blob.vercel-storage.com/uploads/legacy.jpg";
const base = { id: 501, url: privateUrl, planId: 99, ownerId: "owner", isPublic: false, isApproved: true,
  momentsSlug: "qa-plan", momentsEnabled: true, momentsRevealAt: null };
let state;
const meta = (url, size = 3) => ({ url, pathname: new URL(url).pathname.slice(1), size, contentType: "image/webp" });
function reset(extra = {}) {
  state = { row: { ...base }, clerk: null, actor: null, cookie: false, blobs: [meta(privateUrl)],
    bytes: new Uint8Array([1, 2, 3]), listed: [], got: [], put: [], deleted: [], fetched: [], ...extra };
  global.fetch = async (url, options) => {
    assert.equal(url, legacyUrl); assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined);
    state.fetched.push(url);
    return new Response(state.bytes, { headers: { "content-type": "image/jpeg" } });
  };
}
const blob = {
  put: async (pathname, bytes, options) => {
    assert.equal(options.token, "test-private-no-network"); assert.equal(options.access, "private");
    assert.ok(options.abortSignal); state.put.push(pathname);
    return { url: `https://${state.sdkMixedCase ? "FiXtUrE" : "fixture"}.private.blob.vercel-storage.com/${pathname}` };
  },
  list: async options => {
    assert.ok(["test-private-no-network", "test-public-no-network"].includes(options.token));
    state.listed.push(options);
    return { blobs: state.blobs.filter(b => b.pathname.startsWith(options.prefix)).slice(0, 1)
      .map(b => ({ ...b, url: state.sdkMixedCase ? b.url.replace("fixture.", "FiXtUrE.") : b.url })) };
  },
  get: async (pathname, options) => {
    assert.equal(options.access, "private"); assert.equal(options.token, "test-private-no-network");
    assert.equal(options.useCache, false); assert.equal(options.headers, undefined);
    assert.ok(!pathname.includes("://")); state.got.push(pathname);
    const metadata = state.blobs.find(b => b.pathname === pathname);
    if (!metadata) return null;
    return { statusCode: 200, blob: { ...metadata, url: state.sdkGetUrl ?? (state.sdkMixedCase ? metadata.url.replace("fixture.", "FiXtUrE.") : metadata.url) },
      stream: new ReadableStream({ start(c) { c.enqueue(state.bytes); c.close(); } }) };
  },
  del: async (url, options) => {
    assert.equal(options.token, url.includes(".private.") ? "test-private-no-network" : "test-public-no-network");
    state.deleted.push(url);
  },
};
const db = { select() { let table; const q = {
  from(t) { table = t; return q; }, innerJoin() { return q; }, where() { return q; },
  limit: async () => getTableName(table) === "users" ? (state.actor ? [state.actor] : []) : (state.row ? [state.row] : []),
}; return q; } };
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@vercel/blob") return blob;
  if (request === "@clerk/nextjs/server") return { auth: async () => ({ userId: state.clerk }) };
  if (request === "@/lib/db" || resolved === path.join(project, "src/lib/db/index.ts")) return { db };
  if (request === "@/lib/moments/access" || resolved === path.join(project, "src/lib/moments/access.ts")) return { requestHasMomentsAccess: (_req, slug) => slug === "qa-plan" && state.cookie };
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const storage = require("../src/lib/moments/managed-photo");
    const { canReadPhoto } = require("../src/lib/moments/photo-access");
    const { photoContentUrl, serializePhoto, isPhotoFileOptimizerTarget } = require("../src/lib/moments/photo-url");
    const route = require("../src/app/api/event-photos/[id]/file/route");
    const request = () => new Request("https://example.invalid/api/event-photos/501/file");
    const context = { params: Promise.resolve({ id: "501" }) };
    for (const actor of [{ id: "owner", role: "user" }, { id: "admin", role: "admin" }, { id: "super", role: "super_admin" }]) {
      reset({ clerk: "qa", actor, row: { ...base, isApproved: false } });
      const res = await route.GET(request(), context);
      assert.equal(res.status, 200); assert.deepEqual(new Uint8Array(await res.arrayBuffer()), state.bytes);
      assert.match(res.headers.get("cache-control"), /private.*no-store/);
      assert.equal(res.headers.get("location"), null); assert.equal(res.headers.get("content-type"), "image/webp");
      assert.equal(res.headers.get("vary"), "Cookie, Authorization"); assert.equal(state.fetched.length, 0);
    }
    console.log("PASS owner/admin/super-admin pending access; private bytes only, no redirect/shared cache/raw URL");

    const denies = [
      {}, { clerk: "qa", actor: { id: "other-owner", role: "user" } },
      { cookie: true, row: { ...base, isApproved: false } },
      { cookie: true, row: { ...base, momentsEnabled: false } },
      { cookie: true, row: { ...base, momentsRevealAt: new Date("2099-01-01") } },
      { cookie: true, row: { ...base, momentsSlug: "different-plan" } },
      { row: { ...base, isPublic: true, isApproved: false } },
      { row: null },
    ];
    for (const extra of denies) {
      reset(extra); const res = await route.GET(request(), context);
      assert.equal(res.status, 404); assert.equal(state.listed.length + state.got.length + state.fetched.length, 0);
      assert.deepEqual(await res.json(), { error: "Photo not found" });
    }
    reset(); assert.equal((await route.GET(request(), { params: Promise.resolve({ id: "NaN" }) })).status, 404);
    console.log("PASS anonymous/other owner/wrong PIN scope/pending/disabled/future-reveal/missing/invalid deny before any storage access");

    for (const extra of [{ cookie: true }, { row: { ...base, isPublic: true } }]) {
      reset(extra); assert.equal((await route.GET(request(), context)).status, 200);
    }
    assert.equal(canReadPhoto(base, null, true, new Date("2026-09-08")), true);
    assert.equal(canReadPhoto({ ...base, isApproved: false }, null, true), false);
    console.log("PASS approved revealed PIN gallery and deliberately public UGC; withdrawal re-evaluated on every request");

    reset(); delete process.env.MOMENTS_BLOB_READ_WRITE_TOKEN;
    await assert.rejects(storage.storePrivatePhoto(Buffer.from([1]), 99));
    assert.equal(state.put.length, 0);
    assert.equal(await storage.readManagedPhotoBytes(privateUrl, { id: 99 }), null);
    process.env.MOMENTS_BLOB_READ_WRITE_TOKEN = "test-private-no-network";
    assert.match(await storage.storePrivatePhoto(Buffer.from([1]), 99), /^https:\/\/fixture\.private\./);
    await assert.rejects(storage.storePrivatePhoto(Buffer.from([1]), -1));
    console.log("PASS missing dedicated token fails closed, never falls back to public token/storage/local uploads");

    reset(); assert.deepEqual(await storage.readManagedPhotoBytes(privateUrl, { id: 99 }), state.bytes);
    assert.equal(await storage.readManagedPhotoBytes(privateUrl, { id: 100 }), null);
    assert.equal(await storage.readManagedPhotoBytes(privateUrl.replace("fixture", "foreign"), { id: 99 }), null);
    assert.equal(state.got.length, 1);
    reset({ bytes: new Uint8Array(20) }); assert.equal(await storage.readManagedPhotoBytes(privateUrl, { id: 99 }, 10), null);
    console.log("PASS exact namespace/store and private token check, verified pathname-only get, bounded actual private response stream");

    reset({ sdkMixedCase: true, clerk: "qa", actor: { id: "owner", role: "user" } });
    assert.deepEqual(await storage.readManagedPhotoBytes(privateUrl, { id: 99 }), state.bytes);
    assert.equal((await route.GET(request(), context)).status, 200);
    assert.match(await storage.storePrivatePhoto(Buffer.from([1]), 99), /^https:\/\/fixture\.private\./);
    assert.equal(await storage.deleteManagedPhoto(privateUrl, { id: 99 }), true);
    assert.deepEqual(state.deleted, [privateUrl]);
    const priorCalls = state.listed.length + state.got.length;
    assert.equal(await storage.readManagedPhotoBytes(privateUrl.replace("fixture.", "FiXtUrE."), { id: 99 }), null);
    assert.equal(state.listed.length + state.got.length, priorCalls, "user/DB URLs must remain strict canonical");
    for (const sdkGetUrl of [privateUrl.replace("fixture", "foreign"), privateUrl.replace("/99/", "/100/"), `${privateUrl}?download=1`]) {
      reset({ sdkGetUrl }); assert.equal(await storage.readManagedPhotoBytes(privateUrl, { id: 99 }), null);
    }
    for (const raw of [privateUrl.replace("https:", "HTTPS:"), privateUrl.replace("/99/", "/98/../99/"),
      privateUrl.replace(".com/", ".com:443/"), privateUrl.replace("https://", "https://user@"), `${privateUrl}#x`]) {
      assert.equal(storage.canonicalBlobResultUrl(raw), null, "SDK normalization must change only store hostname casing");
    }
    console.log("PASS mixed-case SDK store hosts normalize for put/list/get/delete; raw inputs, foreign store/path and query changes stay rejected");

    reset({ row: { ...base, url: legacyUrl }, clerk: "qa", actor: { id: "owner", role: "user" }, blobs: [meta(legacyUrl)] });
    assert.equal((await route.GET(request(), context)).status, 200);
    state.sdkMixedCase = true;
    assert.equal((await route.GET(request(), context)).status, 200);
    assert.equal(await storage.readManagedPhotoBytes(legacyUrl, { id: 99 }), null);
    assert.equal(await storage.deleteManagedPhoto(legacyUrl, { id: 99 }), false);
    assert.deepEqual(state.deleted, []);
    reset({ row: { ...base, url: legacyUrl }, clerk: "qa", actor: { id: "owner", role: "user" } });
    assert.equal((await route.GET(request(), context)).status, 404); assert.equal(state.fetched.length, 0);
    console.log("PASS legacy display requires independently verified public store object; no inferred deletion/migration rights");

    assert.equal(photoContentUrl(501), "/api/event-photos/501/file");
    assert.deepEqual(serializePhoto({ id: 501, url: privateUrl, caption: "QA" }), { id: 501, url: "/api/event-photos/501/file", caption: "QA" });
    for (const url of ["/api/event-photos/501/file", "https://epetrecere.md/api/event-photos/501/file", "/api/v1/event-photos/501/file", "/api/x/../event-photos/501/file"]) assert.equal(isPhotoFileOptimizerTarget(url), true);
    for (const url of ["/images/catalog.webp", "/brand/logo.png", "https://fixture.public.blob.vercel-storage.com/artists/a.webp", null]) assert.equal(isPhotoFileOptimizerTarget(url), false);
    const sw = readFileSync(path.join(project, "public/sw.js"), "utf8");
    assert.doesNotMatch(sw, /addEventListener\(["']fetch|caches\.(?:put|open|match)/);
    const middleware = readFileSync(path.join(project, "src/middleware.ts"), "utf8");
    assert.match(middleware, /"\/_next\/image"/); assert.match(middleware, /isPhotoFileOptimizerTarget/);
    const guestUi = readFileSync(path.join(project, "src/app/[locale]/(public)/moments/[slug]/client.tsx"), "utf8");
    assert.doesNotMatch(guestUi, /newPhotos|photos: s\.revealed/);
    console.log("PASS ID-only serializers, narrow optimizer cache bypass prevention, no offline SW caching, pending guest uploads never render broken thumbnails");
    console.log("8 private storage/access groups passed; zero external operations");
  } finally {
    Module._load = originalLoad; global.fetch = originalFetch;
    if (originalPrivate === undefined) delete process.env.MOMENTS_BLOB_READ_WRITE_TOKEN; else process.env.MOMENTS_BLOB_READ_WRITE_TOKEN = originalPrivate;
    if (originalPublic === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = originalPublic;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
