/** Real owner-only read + browser request helper using in-memory mocks only. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const root = path.resolve(__dirname, "..");
const dialect = new PgDialect();
const oldLoad = Module._load;
const oldFetch = global.fetch;
global.fetch = async () => { throw Error("External HTTP forbidden"); };
let state;
function reset(extra = {}) { state = { authed: true, role: "artist", owns: true, kind: "artist", missing: false, calls: [], ...extra }; }
const db = { select(projection) {
  let table, condition;
  const rows = () => {
    const name = getTableName(table), { params } = dialect.sqlToQuery(condition);
    state.calls.push(name);
    if (name === "users") { assert.deepEqual(params, ["clerk-qa"]); return [{ id: "qa-owner", role: state.role }]; }
    if (name === "reviews") {
      assert.deepEqual(params, [12]);
      assert.deepEqual(Object.keys(projection).sort(), ["id", "reply", "replyAt", "artistId", "venueId"].sort());
      return state.missing ? [] : [{ id: 12, reply: "Own exact reply", replyAt: "2026-09-07T18:00:00Z", artistId: state.kind === "artist" ? 561 : null, venueId: state.kind === "venue" ? 45 : null }];
    }
    if (name === "artists" || name === "venues") {
      assert.deepEqual(params, [name === "artists" ? 561 : 45, "qa-owner"]);
      return state.owns ? [{ id: name === "artists" ? 561 : 45 }] : [];
    }
    throw Error(`Unexpected query ${name}`);
  };
  const q = { from(t) { table = t; return q; }, where(c) { condition = c; return q; }, limit() { return Promise.resolve(rows()); } }; return q;
} };
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(root, "src/lib/db/index.ts")) return { db };
  if (request === "@clerk/nextjs/server") return { auth: async () => ({ userId: state.authed ? "clerk-qa" : null }) };
  return oldLoad.call(this, request, parent, isMain);
};
(async () => {
  try {
    const { GET } = require("../src/app/api/reviews/[id]/route");
    const { saveReviewReply } = require("../src/lib/reviews/save-reply");
    const req = new Request("https://example.invalid/api/reviews/12");
    const context = { params: Promise.resolve({ id: "12" }) };
    for (const [kind, role] of [["artist", "artist"], ["venue", "user"], ["artist", "admin"], ["venue", "super_admin"]]) {
      reset({ kind, role });
      const response = await GET(req, context);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.deepEqual(await response.json(), { id: 12, reply: "Own exact reply", replyAt: "2026-09-07T18:00:00Z" });
    }
    reset({ owns: false }); assert.equal((await GET(req, context)).status, 403);
    reset({ kind: "venue", role: "user", owns: false }); assert.equal((await GET(req, context)).status, 403);
    reset({ authed: false }); assert.equal((await GET(req, context)).status, 401); assert.equal(state.calls.length, 0);
    reset(); assert.equal((await GET(req, { params: Promise.resolve({ id: "-1" }) })).status, 400);
    reset({ missing: true }); assert.equal((await GET(req, context)).status, 404);
    console.log("PASS real reconciliation GET is owner/admin only, minimal and uncached; anonymous/unrelated users blocked");
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    let calls = [];
    global.fetch = async (url, init) => { calls.push(init?.method || "GET"); return json({ success: true }); };
    assert.equal((await saveReviewReply(12, "Reply")).status, "saved"); assert.deepEqual(calls, ["PUT"]);
    calls = [];
    global.fetch = async (url, init) => {
      calls.push(init?.method || "GET");
      if (init?.method === "PUT") throw Error("Response lost after commit");
      return json({ id: 12, reply: "Reply", replyAt: "2026-09-07T18:00:00Z" });
    };
    assert.equal((await saveReviewReply(12, "Reply")).status, "saved"); assert.deepEqual(calls, ["PUT", "GET"]);
    console.log("PASS known success and lost-after-commit response reconcile without repeating the write");
    calls = [];
    const signals = [];
    global.fetch = (url, init) => { calls.push(init?.method || "GET"); signals.push(init.signal); return new Promise(() => {}); };
    assert.equal((await saveReviewReply(12, "Kept draft", { timeoutMs: 5 })).status, "unknown");
    assert.deepEqual(calls, ["PUT", "GET"]); assert.ok(signals.every(signal => signal.aborted));
    calls = [];
    assert.equal((await saveReviewReply(12, "Kept draft", { verifyBeforeWrite: true, timeoutMs: 5 })).status, "unknown");
    assert.deepEqual(calls, ["GET"], "no retry mutation when reconciliation is unavailable");
    calls = [];
    global.fetch = async (url, init) => {
      calls.push(init?.method || "GET");
      return { ok: true, status: 200, json: () => new Promise(() => {}) };
    };
    assert.equal((await saveReviewReply(12, "Kept draft", { timeoutMs: 5 })).status, "unknown");
    assert.deepEqual(calls, ["PUT", "GET"], "deadline includes stalled response JSON bodies, not just headers");
    console.log("PASS hung write/read requests finish with unknown outcome, never false failure or automatic retry");
    calls = [];
    global.fetch = async (url, init) => { calls.push(init?.method || "GET"); return json({ id: 12, reply: "Reply", replyAt: null }); };
    assert.equal((await saveReviewReply(12, "Reply", { verifyBeforeWrite: true })).status, "saved"); assert.deepEqual(calls, ["GET"]);
    calls = [];
    global.fetch = async (url, init) => { calls.push(init?.method || "GET"); return json(init?.method === "PUT" ? { success: true } : { id: 12, reply: null, replyAt: null }); };
    assert.equal((await saveReviewReply(12, "Reply", { verifyBeforeWrite: true })).status, "saved"); assert.deepEqual(calls, ["GET", "PUT"]);
    global.fetch = async () => json({ error: "Forbidden" }, 403);
    assert.equal((await saveReviewReply(12, "Reply")).status, "rejected");
    console.log("PASS an explicit retry reads first; saved content is not resent, definite authorization rejection stays distinct");
    const ui = readFileSync(path.join(root, "src/app/[locale]/(vendor)/dashboard/sala/recenzii/client.tsx"), "utf8");
    const unknownBranch = ui.slice(ui.indexOf('if (result.status === "unknown")'), ui.indexOf('if (result.status === "rejected")'));
    assert.match(unknownBranch, /replyUncertain/); assert.doesNotMatch(unknownBranch, /setReplyText|setReplyingTo/);
    assert.match(ui, /finally \{\s+setSubmitting\(false\)/);
    for (const locale of ["ro", "ru", "en"]) assert.ok(JSON.parse(readFileSync(path.join(root, `src/i18n/${locale}.json`), "utf8")).vendor.venueReviews.replyUncertain);
    console.log("PASS draft remains intact, submit state resets and uncertainty copy exists in RO/RU/EN");
    console.log("5 review-reply timeout regression groups passed; zero external operations");
  } finally { Module._load = oldLoad; global.fetch = oldFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
