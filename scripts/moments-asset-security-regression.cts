/** Real route handlers, in-memory DB/Blob/fetch doubles. No external operations. */
/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS loader intercepts prevent all external side effects */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const sharp = require("sharp");
const JSZip = require("jszip");
const project = path.resolve(__dirname, "..");
const dialect = new PgDialect();
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
const originalPrivateToken = process.env.MOMENTS_BLOB_READ_WRITE_TOKEN;
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_fixture_test-public-no-network";
process.env.MOMENTS_BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_fixture_test-private-no-network";
const store = "https://fixture.public.blob.vercel-storage.com";
const scope = { id: 99, momentsSlug: "qa-plan-99", userId: "qa-owner" };
const ownUrl = `${store}/event-photos/99/owned.webp`;
let state;
function reset(extra = {}) {
  state = { allowed: true, access: true, rows: [], blobs: [], puts: [], dels: [], lists: [], queries: [], inserts: [], registry: new Map(), outbox: [], deletes: 0, insertFailure: false, ...extra };
  global.fetch = async () => { throw Error("External HTTP forbidden"); };
}
function metadata(url, size = 3) { return { url, pathname: new URL(url).pathname.slice(1), size }; }
const blob = {
  put: async (pathname, bytes, options) => {
    assert.equal(options.token, "vercel_blob_rw_fixture_test-private-no-network");
    assert.equal(options.access, "private");
    assert.equal(options.contentType, "image/webp");
    state.puts.push({ pathname, bytes, options });
    const result = metadata(`${store.replace(".public.", ".private.")}/${pathname}`, bytes.length);
    state.blobs.push(result);
    return result;
  },
  list: async (options) => {
    assert.ok(["vercel_blob_rw_fixture_test-public-no-network", "vercel_blob_rw_fixture_test-private-no-network"].includes(options.token));
    assert.equal(options.limit, 1);
    assert.ok(options.abortSignal);
    state.lists.push(options.prefix);
    return { blobs: state.blobs.filter(item => item.pathname.startsWith(options.prefix)).slice(0, 1), hasMore: false };
  },
  del: async (url, options) => {
    assert.equal(options.token, url.includes(".private.") ? "vercel_blob_rw_fixture_test-private-no-network" : "vercel_blob_rw_fixture_test-public-no-network");
    assert.ok(options.abortSignal);
    state.dels.push(url);
  },
};
const db = {
  select() {
    let table, condition;
    const result = () => {
      const name = getTableName(table);
      const rendered = dialect.sqlToQuery(condition);
      state.queries.push({ name, params: rendered.params });
      if (name === "event_plans") { assert.deepEqual(rendered.params, [99]); return [{ title: "QA Moments", eventDate: "2026-09-20", userId: scope.userId }]; }
      if (name === "account_blob_assets") return [...state.registry.values()].filter(row => rendered.params.includes(row.assetKey));
      if (name === "account_blob_asset_claims") return [];
      assert.equal(name, "event_photos");
      assert.ok(rendered.params.includes(99) || rendered.params.includes(scope.momentsSlug));
      return state.rows;
    };
    const q = { from(t) { table = t; return q; }, innerJoin() { return q; }, where(c) { condition = c; return q; }, orderBy() { return q; }, for() { return q; }, limit() { return Promise.resolve(result()); }, then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); } };
    return q;
  },
  insert(table) {
    const name = getTableName(table);
    if (name === "account_blob_assets") return { values(values) { return { onConflictDoNothing() { return { returning: async () => {
      if (state.registry.has(values.assetKey)) return [];
      const row = { ...values, state: "active" };
      state.registry.set(values.assetKey, row);
      return [{ assetKey: values.assetKey }];
    } }; } }; } };
    if (name === "account_asset_erasure_outbox") return { values(values) { return { onConflictDoNothing() { return { returning: async () => {
      state.outbox.push(values);
      return [{ assetKey: values.assetKey }];
    } }; } }; } };
    assert.equal(name, "event_photos");
    return { values(values) { return { returning: async () => {
      if (state.insertFailure) throw Error("Synthetic database failure");
      state.inserts.push(values);
      return [{ id: 500, ...values }];
    } }; } };
  },
  update(table) {
    assert.equal(getTableName(table), "account_blob_assets");
    let patch;
    return { set(values) { patch = values; return { where() { return { returning: async () => {
      const [row] = [...state.registry.values()];
      if (!row) return [];
      Object.assign(row, patch);
      return [{ assetKey: row.assetKey }];
    } }; } }; } };
  },
  delete(table) {
    assert.equal(getTableName(table), "event_photos");
    return { where(condition) {
      const params = dialect.sqlToQuery(condition).params;
      assert.ok(params.includes(500));
      const result = () => { state.deletes++; return state.rows.map(row => ({ url: row.url })); };
      return { returning: async () => result(), then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); } };
    } };
  },
  transaction(callback) { return callback(db); },
};
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@vercel/blob") return blob;
  if (request === "@/lib/db" || resolved === path.join(project, "src/lib/db/index.ts")) return { db };
  if (request === "@/lib/planner/ownership" || resolved === path.join(project, "src/lib/planner/ownership.ts")) return {
    requirePlanOwnership: async id => { assert.equal(id, 99); return state.allowed ? { ok: true, userId: "qa-owner", plan: scope } : { ok: false, status: 403, error: "Forbidden" }; },
  };
  if (request === "@/lib/moments/access" || resolved === path.join(project, "src/lib/moments/access.ts")) return { requestHasMomentsAccess: () => state.access };
  if (request === "@/lib/rate-limit" || resolved === path.join(project, "src/lib/rate-limit.ts")) return { rateLimit: async () => ({ success: true }) };
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const helpers = require("../src/lib/moments/managed-photo");
    const owner = require("../src/app/api/event-plans/[id]/photos/route");
    const ownerPhoto = require("../src/app/api/event-plans/[id]/photos/[photoId]/route");
    const guestPhoto = require("../src/app/api/moments/[slug]/photos/[photoId]/route");
    const download = require("../src/app/api/event-plans/[id]/moments/download/route");
    const context = { params: Promise.resolve({ id: "99", photoId: "500", slug: scope.momentsSlug }) };
    const json = (data, method = "POST") => new Request("https://example.invalid/api/qa", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const row = url => ({ id: 500, planId: 99, url, deviceId: "qa-device", guestName: "QA", guestMessage: "Synthetic only", createdAt: new Date() });
    const unsafe = [
      "http://127.0.0.1/private", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "file:///etc/passwd",
      "/uploads/private.jpg", "https://example.invalid/foreign.jpg", `${store}/artists/other.jpg`,
      `${store}/event-photos/100/owned.webp`, `${store}/moments/other-plan/owned.webp`,
      `${store}/event-photos/99/../100/owned.webp`, `${store}/event-photos/99/%2e%2e/private.webp`,
      `${store}/event-photos/99/owned.webp?redirect=http://127.0.0.1`, `${store}/event-photos/99/owned.webp#x`,
      "https://fixture.public.blob.vercel-storage.com.evil.invalid/event-photos/99/x.webp",
      "https://user:pass@fixture.public.blob.vercel-storage.com/event-photos/99/x.webp",
      "https://fixture.private.blob.vercel-storage.com/event-photos/100/x.webp",
    ];
    reset();
    for (const url of unsafe) assert.equal(await helpers.verifyManagedPhoto(url, scope), null, url);
    assert.equal(state.lists.length, 0);
    assert.equal(helpers.managedPhotoPath(ownUrl, scope), "event-photos/99/owned.webp");
    assert.equal(helpers.managedPhotoPath(`${store}/moments/qa-plan-99/1-uuid.webp`, scope), "moments/qa-plan-99/1-uuid.webp");
    reset({ blobs: [metadata(ownUrl)] });
    assert.ok(await helpers.verifyManagedPhoto(ownUrl, scope));
    assert.equal(await helpers.verifyManagedPhoto(ownUrl.replace("fixture.public", "foreign.public"), scope), null);
    console.log("PASS strict namespace/URL checks and exact token-store listing reject foreign plan, slug, store, local/private and crafted URLs");

    for (const url of [...unsafe, ownUrl]) {
      reset();
      const response = await owner.POST(json({ url }), context);
      assert.equal(response.status, 410);
      assert.equal(state.inserts.length + state.puts.length, 0);
    }
    reset({ allowed: false });
    assert.equal((await owner.POST(json({ url: ownUrl }), context)).status, 403);
    assert.equal((await owner.GET(new Request("https://example.invalid"), context)).status, 403);
    assert.equal((await ownerPhoto.DELETE(json({}, "DELETE"), context)).status, 403);
    assert.equal((await download.GET(new Request("https://example.invalid"), context)).status, 403);
    assert.equal(state.queries.length + state.deletes + state.puts.length, 0);
    console.log("PASS JSON URL attachment is closed and unowned users cannot upload, list, delete or download");

    const input = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#997744" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const multipart = () => {
      const form = new FormData();
      form.append("file", new File([input], "fixture.jpg", { type: "image/jpeg" }));
      form.append("caption", "Own QA image");
      form.append("url", `${store}/artists/foreign.jpg`);
      form.append("isPublic", "true"); form.append("isApproved", "true");
      return new Request("https://example.invalid", { method: "POST", body: form });
    };
    reset();
    await helpers.storePrivatePhoto(Buffer.from([1, 2, 3]), 99, "qa-owner");
    assert.equal(state.registry.size, 1);
    reset();
    const uploaded = await owner.POST(multipart(), context);
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    assert.equal(state.puts.length, 1);
    assert.equal((await uploaded.json()).photo.url, "/api/event-photos/500/file");
    assert.match(state.puts[0].pathname, /^event-photos\/99\/[\da-f-]+\.webp$/);
    const imageMeta = await sharp(state.puts[0].bytes).metadata();
    assert.equal(imageMeta.format, "webp"); assert.equal(imageMeta.exif, undefined);
    assert.equal(imageMeta.width, 40); assert.equal(imageMeta.height, 30);
    assert.equal(state.inserts[0].planId, 99); assert.equal(state.inserts[0].userId, "qa-owner");
    assert.equal(state.inserts[0].isPublic, false); assert.equal(state.inserts[0].isApproved, false);
    assert.notEqual(state.inserts[0].url, `${store}/artists/foreign.jpg`);
    assert.equal([...state.registry.values()][0].ownerUserId, "qa-owner");
    assert.equal([...state.registry.values()][0].provenance, "moments_photo");
    reset({ insertFailure: true });
    assert.equal((await owner.POST(multipart(), context)).status, 503);
    assert.deepEqual(state.dels, []);
    assert.equal(state.outbox.length, 1);
    assert.equal([...state.registry.values()][0].state, "queued");
    console.log("PASS valid own upload records server ownership; caller publication/URL fields are ignored; failed attachment queues only its registered object");

    for (const url of [...unsafe, ownUrl.replace("fixture.public", "foreign.public")]) {
      reset({ rows: [row(url)], blobs: [metadata(ownUrl)] });
      const response = await ownerPhoto.DELETE(json({}, "DELETE"), context);
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, "PHOTO_ERASURE_REVIEW_REQUIRED");
      assert.equal(state.deletes, 0); assert.deepEqual(state.dels, []);
    }
    reset({ rows: [row(ownUrl)], blobs: [metadata(ownUrl)] });
    assert.equal((await (await ownerPhoto.DELETE(json({}, "DELETE"), context)).json()).ok, true);
    assert.deepEqual(state.dels, [ownUrl]);
    reset({ access: false });
    assert.equal((await guestPhoto.DELETE(json({ deviceId: "qa-device" }, "DELETE"), context)).status, 401);
    reset({ rows: [row(ownUrl)] });
    assert.equal((await guestPhoto.DELETE(json({ deviceId: "other-device" }, "DELETE"), context)).status, 404);
    assert.equal(state.deletes, 0);
    const guestUrl = `${store}/moments/qa-plan-99/guest.webp`;
    reset({ rows: [row(guestUrl)], blobs: [metadata(guestUrl)] });
    assert.equal((await guestPhoto.DELETE(json({ deviceId: "qa-device" }, "DELETE"), context)).status, 200);
    assert.deepEqual(state.dels, [guestUrl]);
    console.log("PASS legacy/foreign provenance is retained for review; owner and exact uploader delete only verified store files");

    for (const url of [...unsafe, ownUrl.replace("fixture.public", "foreign.public")]) {
      reset({ rows: [row(url)], blobs: [metadata(ownUrl)] });
      const response = await download.GET(new Request("https://example.invalid"), context);
      assert.equal(response.status, 200);
      const zip = await JSZip.loadAsync(await response.arrayBuffer());
      assert.ok((await zip.file("_README.txt").async("string")).includes("500"));
      assert.equal(Object.keys(zip.files).filter(name => /\.webp$/.test(name)).length, 0);
    }
    reset({ rows: [row(ownUrl)], blobs: [metadata(ownUrl)] });
    const fetched = [];
    global.fetch = async (url, options) => {
      fetched.push(url); assert.equal(options.redirect, "error"); assert.ok(options.signal);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } });
    };
    const downloaded = await download.GET(new Request("https://example.invalid"), context);
    const zipBytes = await downloaded.arrayBuffer();
    assert.ok(zipBytes.byteLength < 4 * 1024 * 1024);
    const zip = await JSZip.loadAsync(zipBytes);
    assert.equal(Object.keys(zip.files).filter(name => /\.webp$/.test(name)).length, 1);
    assert.deepEqual(fetched, [ownUrl]);
    console.log("PASS real ZIP handler never fetches untrusted assets, includes valid managed photos and bounded README/credits");

    let cancelled = false;
    global.fetch = async (_url, options) => {
      assert.equal(options.redirect, "error");
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(20)); }, cancel() { cancelled = true; } }), { headers: { "content-type": "image/webp", "content-length": "1" } });
    };
    assert.equal(await helpers.fetchManagedPhotoBytes(ownUrl, 10, 20), null);
    await Promise.resolve(); assert.equal(cancelled, true);
    global.fetch = async () => new Response("not-image", { headers: { "content-type": "text/html" } });
    assert.equal(await helpers.fetchManagedPhotoBytes(ownUrl, 10, 20), null);
    global.fetch = async (_url, options) => { assert.equal(options.redirect, "error"); throw Error("redirect to localhost rejected"); };
    assert.equal(await helpers.fetchManagedPhotoBytes(ownUrl, 10, 20), null);
    global.fetch = async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "image/webp" } });
    assert.equal(await helpers.fetchManagedPhotoBytes(ownUrl, 10, 5), null);
    console.log("PASS lying Content-Length, oversized stream, redirect, wrong media and stalled body all fail closed with bounded reads");

    const ui = readFileSync(path.join(project, "src/components/planner/photos-view.tsx"), "utf8");
    assert.doesNotMatch(ui, /fetch\("\/api\/upload"/);
    assert.match(ui, /body: fd/); assert.match(ui, /storagePreserved/);
    const mobile = readFileSync(path.join(project, "packages/mobile/app/(client)/moments/[id].tsx"), "utf8");
    assert.doesNotMatch(mobile, /\/upload["`]|api\.post\(API_PATHS\.eventPlanPhotos/);
    assert.match(mobile, /\$\{baseUrl\}\$\{API_PATHS\.eventPlanPhotos\(planId\)\}/);
    assert.match(mobile, /body: form/);
    assert.match(mobile, /Authorization: `Bearer \$\{token\}`/);
    assert.match(mobile, /asset\.fileSize > 4 \* 1024 \* 1024/);
    assert.match(mobile, /uploadMutation\.isError/);
    const alias = require("../src/app/api/v1/event-plans/[id]/photos/route.ts");
    assert.equal(alias.POST, owner.POST);
    const genericUpload = readFileSync(path.join(project, "src/app/api/upload/route.ts"), "utf8");
    const allowed = genericUpload.slice(genericUpload.indexOf("const allowedFolders"), genericUpload.indexOf("const rawFolder"));
    assert.doesNotMatch(allowed, /event-photos|moments/);
    const route = readFileSync(path.join(project, "src/app/api/event-plans/[id]/moments/download/route.ts"), "utf8");
    assert.match(route, /blob\.byteLength > MAX_ARCHIVE_BYTES/);
    assert.match(route, /MAX_PHOTOS \+ 1/);
    for (const locale of ["ro", "ru", "en"]) assert.ok(JSON.parse(readFileSync(path.join(project, `src/i18n/${locale}.json`), "utf8")).planner.photos.storagePreserved);
    console.log("PASS UI uses the atomic endpoint, all locales disclose preserved legacy files, generic upload cannot write managed namespaces, ZIP has final byte check");
    console.log("7 Moments asset-security groups passed; zero external operations");
  } finally {
    Module._load = originalLoad; global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    if (originalPrivateToken === undefined) delete process.env.MOMENTS_BLOB_READ_WRITE_TOKEN;
    else process.env.MOMENTS_BLOB_READ_WRITE_TOKEN = originalPrivateToken;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
