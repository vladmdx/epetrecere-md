/** Real consumer handlers with in-memory dependencies. No DB, Blob, email or AI calls. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const { NextRequest } = require("next/server");
const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalConsoleError = console.error;
const savedKeys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].map(key => [key, process.env[key]]);
const dialect = new PgDialect();
const bytes = Buffer.from("5249464614000000574542505650382000000000", "hex");
const secretUrl = "https://fixture.private.blob.vercel-storage.com/event-photos/99/private.webp";
let state;
const reset = (extra = {}) => { state = { allowed: true, queries: [], reads: [], writes: [], emails: [], ai: [], ...extra }; };
const db = {
  select(projection) {
    let table, condition;
    const rows = () => {
      const name = getTableName(table), query = dialect.sqlToQuery(condition);
      state.queries.push(query);
      if (name === "event_plans") {
        assert.deepEqual(query.params, [99]);
        return [{ id: 99, title: 'QA <img src="x" onerror="bad()"> & <script>bad</script>\r\nTest', eventDate: "2026-09-20", ownerEmail: "fixture@example.invalid", slug: "PRIVATE-SLUG" }];
      }
      assert.equal(name, "event_photos");
      if (query.params.includes(561)) {
        assert.ok(query.params.includes(true));
        assert.equal(projection.url, undefined, "public artist query does not project storage URL");
        return [{ id: 101, caption: "Published", createdAt: "2026-09-07" }];
      }
      assert.ok(query.params.includes(99), "photos are scoped to owned plan");
      if (projection.isApproved) return [{ id: 101, url: secretUrl, isApproved: true, deviceId: "secret-device", createdAt: "2026-09-07T12:00:00Z" }];
      if (!projection.url) return [{ id: 102 }];
      return [{ id: 101, url: secretUrl }, { id: 102, url: "https://foreign.invalid/private.jpg" }];
    };
    const q = { from(t) { table = t; return q; }, innerJoin() { return q; }, where(c) { condition = c; return q; }, orderBy() { return q; }, limit() { return Promise.resolve(rows()); }, then(a, b) { return Promise.resolve().then(rows).then(a, b); } };
    return q;
  },
  update() { return { set(values) { return { where(condition) { assert.deepEqual(dialect.sqlToQuery(condition).params, [101, 99]); state.writes.push(values); return Promise.resolve(); } }; } }; },
};
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(root, "src/lib/db/index.ts")) return { db };
  if (resolved === path.join(root, "src/lib/planner/ownership.ts")) return { requirePlanOwnership: async id => { assert.equal(id, 99); return state.allowed ? { ok: true, userId: "owner", plan: { id: 99, momentsSlug: "PRIVATE-SLUG" } } : { ok: false, error: "Forbidden", status: 403 }; } };
  if (resolved === path.join(root, "src/lib/moments/managed-photo.ts")) return { readManagedPhotoBytes: async (url, plan, limit) => { assert.equal(plan.id, 99); assert.equal(limit, 4 * 1024 * 1024); state.reads.push(url); return url === secretUrl ? bytes : null; } };
  if (resolved === path.join(root, "src/lib/rate-limit.ts")) return { rateLimit: async () => ({ success: true }) };
  if (resolved === path.join(root, "src/lib/email/send.ts")) return { sendEmail: async email => { state.emails.push(email); } };
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    process.env.OPENAI_API_KEY = "test-no-network";
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/chat/completions", "only intercepted provider endpoint");
      const payload = JSON.parse(options.body); state.ai.push(payload);
      return Response.json({ id: "fixture", choices: [{ message: { content: "decor" } }], usage: {} });
    };
    console.error = (...args) => { assert.ok(!JSON.stringify(args).includes(secretUrl)); };
    const { classifyPhoto } = require("../src/lib/ai");
    const { getAiClient } = require("../src/lib/ai/provider");
    const categorize = require("../src/app/api/event-plans/[id]/photos/categorize/route");
    const recap = require("../src/app/api/event-plans/[id]/moments/recap/route");
    const { getUgcPhotosForArtist } = require("../src/lib/db/queries/artists");
    const context = { params: Promise.resolve({ id: "99" }) };

    reset();
    assert.equal(await classifyPhoto(bytes), "decor");
    const imagePart = state.ai[0].messages.find(m => m.role === "user").content.find(part => part.type === "image_url");
    assert.equal(imagePart.image_url.url, `data:image/webp;base64,${bytes.toString("base64")}`);
    assert.ok(!JSON.stringify(state.ai).includes(secretUrl));
    await assert.rejects(() => classifyPhoto(secretUrl), /Unsupported photo/);
    await assert.rejects(() => classifyPhoto(Buffer.from("not an image at all")), /Unsupported photo/);
    await assert.rejects(() => getAiClient().messages.create({ model: "fixture", max_tokens: 20, messages: [{ role: "user", content: [{ type: "image", source: { type: "url", url: secretUrl } }, { type: "text", text: "Classify" }] }] }), /Inline image/);
    assert.equal(state.ai.length, 1, "URL image rejected before mocked fetch");
    await getAiClient().messages.create({ model: "fixture", max_tokens: 20, messages: [{ role: "user", content: [{ type: "text", text: "Text unchanged" }] }] });
    assert.deepEqual(state.ai[1].messages, [{ role: "user", content: "Text unchanged" }]);
    console.log("PASS real classifier and provider preserve verified bytes as base64, reject raw URLs, preserve text fallback");

    reset({ allowed: false });
    assert.equal((await categorize.POST(new NextRequest("https://example.invalid"), context)).status, 403);
    assert.equal((await recap.POST(new NextRequest("https://example.invalid"), context)).status, 403);
    assert.equal(state.reads.length + state.emails.length + state.ai.length + state.queries.length, 0);
    reset();
    const result = await (await categorize.POST(new NextRequest("https://example.invalid"), context)).json();
    assert.equal(result.tally.decor, 1); assert.equal(result.tally.error, 1);
    assert.equal(state.ai.length, 1); assert.deepEqual(state.writes, [{ category: "decor" }]);
    console.log("PASS categorize owner scope, guarded bytes before AI, unavailable foreign content skipped, updates retain plan scope");

    reset();
    assert.equal((await recap.POST(new NextRequest("https://example.invalid"), context)).status, 200);
    assert.equal(state.emails.length, 1);
    const email = state.emails[0];
    assert.equal(email.to, "fixture@example.invalid");
    assert.match(email.html, /&lt;img/); assert.match(email.html, /&lt;script&gt;/);
    assert.doesNotMatch(email.html, /<img|<script|PRIVATE-SLUG|private\.blob|secret-device/);
    assert.match(email.html, /cabinet(?:&#x2F;|\/)moments(?:&#x2F;|\/)99/);
    assert.doesNotMatch(email.subject, /[\r\n]/);
    console.log("PASS recap email contains escaped statistics and authenticated dashboard link, no thumbnails, slug or private URL");

    reset();
    const ugc = await getUgcPhotosForArtist(561);
    assert.deepEqual(ugc, [{ id: 101, caption: "Published", createdAt: "2026-09-07", url: "/api/event-photos/101/file" }]);
    const source = file => readFileSync(path.join(root, file), "utf8");
    const listing = source("src/app/[locale]/(public)/nunti-reale/page.tsx");
    assert.match(listing, /SELECT id FROM/); assert.doesNotMatch(listing, /SELECT url FROM/);
    assert.match(listing, /photoContentUrl\(r\.coverPhotoId\)/); assert.match(listing, /unoptimized/);
    assert.match(source("src/app/[locale]/(public)/nunti-reale/[id]/page.tsx"), /url: photoContentUrl\(p\.id\)/);
    const gallery = source("src/app/[locale]/(public)/nunti-reale/[id]/gallery.tsx");
    assert.equal((gallery.match(/<Image\b/g) || []).length, (gallery.match(/\bunoptimized\b/g) || []).length);
    assert.match(source("src/app/api/me/data-export/route.ts"), /eventPhotos: userPhotos\.map\(\(photo\) => \(\{ \.\.\.photo, url: photoContentUrl\(photo\.id\) \}\)\)/);
    console.log("PASS public UGC and export use photo-ID content endpoints; public image optimization cannot persist revoked image copies");

    const mobile = source("packages/mobile/app/(client)/moments/[id].tsx");
    assert.doesNotMatch(mobile, /mediaUrl\(item\.url\)/);
    assert.match(mobile, /mediaUrl\(`\/api\/event-photos\/\$\{photoId\}\/file`\)/);
    assert.match(mobile, /headers: \{ Authorization: `Bearer \$\{photoToken\}` \}/);
    assert.match(mobile, /photoAuth && photoAuth\.userId === userId \? photoAuth\.token : null/);
    assert.equal((mobile.match(/source=\{photoSource\(item\.id\)\}/g) || []).length, 2);
    assert.equal((mobile.match(/cachePolicy="none"/g) || []).length, 2);
    console.log("PASS native image sources attach short-lived auth only to fixed same-origin photo-ID routes, with disk cache disabled");
    console.log("5 private consumer groups passed; no external operations");
  } finally {
    Module._load = originalLoad; global.fetch = originalFetch; console.error = originalConsoleError;
    for (const [key, value] of savedKeys) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
