/** Actual AI route, in-memory scoped DB and model transport; no external operations. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const root = path.resolve(__dirname, "..");
const dialect = new PgDialect();
const oldLoad = Module._load;
const oldFetch = global.fetch;
const oldKey = process.env.ANTHROPIC_API_KEY;
process.env.ANTHROPIC_API_KEY = "fixture-unused";
global.fetch = async () => { throw Error("External HTTP forbidden"); };
let state;
function reset(extra = {}) {
  state = { role: "artist", userId: "qa-artist-owner", authed: true, artistMissing: false, queries: [], prompts: [],
    artist: { id: 561, nameRo: "QA Foto Video Bălți", nameRu: "QA Фото Видео Бельцы", nameEn: "QA Photo Video Balti", baseCity: "Bălți", location: "Chișinău", categoryIds: [28], phone: "+12025550123", email: "qa@example.invalid", documentSnapshot: "PRIVATE CONTRACT" },
    ...extra };
}
const db = {
  select(projection) {
    let table, condition;
    const rows = () => {
      const name = getTableName(table);
      const query = dialect.sqlToQuery(condition);
      state.queries.push({ name, ...query });
      if (name === "users") { assert.ok(query.params.includes("clerk-qa")); return [{ id: state.userId, role: state.role }]; }
      if (name === "artists") {
        assert.match(query.sql, /"user_id"/);
        assert.deepEqual(query.params, [state.userId], "profile may only use the authenticated owner, never supplied artist ID");
        assert.deepEqual(Object.keys(projection).sort(), ["id", "nameRo", "nameRu", "nameEn", "baseCity", "location", "categoryIds"].sort());
        return state.artistMissing ? [] : [Object.fromEntries(Object.keys(projection).map(key => [key, state.artist[key]]))];
      }
      if (name === "categories") {
        assert.deepEqual(query.params, [28]);
        assert.deepEqual(Object.keys(projection).sort(), ["id", "nameRo", "nameRu", "nameEn"].sort());
        return [{ id: 28, nameRo: "Foto & Video", nameRu: "Фото и видео", nameEn: "Photo & Video" }];
      }
      if (name === "booking_requests") {
        assert.match(query.sql, /"artist_id"/);
        assert.deepEqual(query.params, [561]);
        assert.ok(!Object.keys(projection).some(key => /phone|email|message|signature/i.test(key)));
        return [{ id: 257, eventDate: "2026-09-20", startTime: "14:00", endTime: "00:00", status: "accepted", eventType: "nunta", agreedPrice: 300 }];
      }
      throw Error(`Unexpected DB query: ${name}`);
    };
    const chain = { from(value) { table = value; return chain; }, where(value) { condition = value; return chain; }, limit() { return chain; }, orderBy() { return chain; }, then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); } };
    return chain;
  },
};
const model = { messages: { create: async params => {
  state.prompts.push(params.system);
  if (state.role === "admin") return { stop_reason: "end_turn", content: [{ type: "text", text: "Admin fixture" }] };
  assert.match(params.system, /QA Foto Video Bălți/);
  assert.match(params.system, /"baseCity":"Bălți"/);
  assert.match(params.system, /Foto & Video/);
  assert.match(params.system, /QA Фото Видео Бельцы/);
  assert.match(params.system, /QA Photo Video Balti/);
  assert.doesNotMatch(params.system, /qa@example\.invalid|12025550123|PRIVATE CONTRACT/);
  assert.deepEqual(params.tools.map(tool => tool.name), ["get_my_bookings", "get_my_calendar", "update_my_calendar"], "role allowlist unchanged");
  if (state.prompts.length === 1) return { stop_reason: "tool_use", content: [{ type: "tool_use", name: "get_my_bookings", id: "booking-read", input: {} }] };
  const result = params.messages.at(-1).content[0];
  assert.equal(result.tool_use_id, "booking-read");
  assert.equal(JSON.parse(result.content)[0].status, "accepted");
  return { stop_reason: "end_turn", content: [{ type: "text", text: "QA Foto Video Bălți, Bălți, Foto & Video. 20.09.2026: accepted." }] };
} } };
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(root, "src/lib/db/index.ts")) return { db };
  if (request === "@clerk/nextjs/server") return { auth: async () => ({ userId: state.authed ? "clerk-qa" : null }) };
  if (request === "@/lib/ai/provider" || resolved === path.join(root, "src/lib/ai/provider.ts")) return { getAiClient: () => model };
  return oldLoad.call(this, request, parent, isMain);
};
(async () => {
  try {
    const { POST } = require("../src/app/api/ai/chat/route");
    const { getOwnArtistProfileContext } = require("../src/lib/ai/artist-profile-context");
    const req = (context = "vendor") => new Request("https://example.invalid/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context, artistId: 999, userId: "other-owner", messages: [{ role: "user", content: "Care sunt numele, orașul, categoria și starea rezervării pe 20 septembrie 2026?" }] }) });
    reset();
    const result = await POST(req());
    assert.equal(result.status, 200);
    assert.match((await result.json()).reply, /Foto & Video.*accepted/);
    assert.equal(state.prompts.length, 2);
    console.log("PASS real route supplies localized own profile in each model round, booking still obtained from scoped tool");
    reset();
    state.artist.nameRo = "<b>QA</b> qa&#64;example.invalid";
    state.artist.baseCity = null;
    state.artist.location = "Bălți";
    state.artist.categoryIds = [];
    const own = await getOwnArtistProfileContext(state.userId);
    assert.equal(own.baseCity, "Bălți");
    assert.deepEqual(own.categories, []);
    assert.ok(!JSON.stringify(own).includes("example.invalid"));
    assert.equal(state.queries.length, 1);
    console.log("PASS minimal columns only, legacy location fallback, no-category profile and contact-bearing labels safe");
    for (const role of ["user", "venue"]) {
      reset({ role });
      assert.equal((await POST(req())).status, 403);
      assert.equal(state.queries.length, 1);
      assert.equal(state.prompts.length, 0);
    }
    reset(); assert.equal((await POST(req("admin"))).status, 403);
    reset({ authed: false }); assert.equal((await POST(req())).status, 401); assert.equal(state.queries.length, 0);
    reset({ artistMissing: true }); assert.equal((await POST(req())).status, 404); assert.equal(state.prompts.length, 0);
    console.log("PASS unauthenticated, wrong-role and missing-profile gates remain fail-closed");
    reset({ role: "admin" });
    assert.equal((await POST(req("admin"))).status, 200);
    assert.doesNotMatch(state.prompts[0], /QA Foto Video|PROFILUL PROPRIU/);
    assert.equal(state.queries.length, 1);
    console.log("PASS admin context unchanged and never receives the artist profile automatically");
    console.log("4 artist AI profile regression groups passed; zero external operations");
  } finally {
    Module._load = oldLoad;
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
