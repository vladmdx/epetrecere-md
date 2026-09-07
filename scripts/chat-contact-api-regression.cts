/** Actual chat route handlers with in-memory DB/auth/notification doubles.
 * No database or outbound request can execute in this regression. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const { NextRequest } = require("next/server");
const root = path.resolve(__dirname, "..");
const oldLoad = Module._load;
const oldFetch = global.fetch;
global.fetch = async () => { throw Error("External HTTP forbidden"); };
let state;
const reset = (extra = {}) => { state = { actor: "client", signedIn: true, kind: "artist", status: "pending", trace: [], ...extra }; };
const actorId = () => state.actor === "client" ? "client-id" : `${state.actor}-owner`;
const dialect = new PgDialect();
const raw = { id: 91, bookingRequestId: 257, conversationId: 50, senderType: "client", senderName: "qa@example.invalid", message: "Test QA contact fictiv: qa@example.invalid +12025550123", attachmentUrl: "https://example.invalid/contact.pdf", attachmentName: "+12025550123.pdf", attachmentMime: "application/pdf", createdAt: new Date() };
const booking = () => ({ id: 257, clientUserId: "client-id", artistId: state.kind === "artist" ? 561 : null, venueId: state.kind === "venue" ? 45 : null, clientEmail: "qa@example.invalid", status: state.status });
const db = {
  select() {
    let table, condition;
    const rows = () => {
      const name = getTableName(table);
      const params = condition ? dialect.sqlToQuery(condition).params : [];
      if (name === "users") return [{ id: actorId(), name: "QA Person", role: "user", email: "qa@example.invalid" }];
      if (name === "booking_requests") return params.includes(257) || params.includes("client-id") ? [booking()] : [];
      if (name === "artists" || name === "venues") {
        const kind = name === "artists" ? "artist" : "venue";
        if (params.includes(actorId()) && state.actor !== kind) return [];
        return [{ id: kind === "artist" ? 561 : 45, nameRo: "QA Vendor", userId: `${kind}-owner`, email: "qa@example.invalid" }];
      }
      if (name === "conversations") return [{ id: 50, ...booking(), id: 50, clientUnread: 0, artistUnread: 0 }];
      if (name === "chat_messages") return [raw];
      return [];
    };
    const q = { from(value) { table = value; return q; }, where(value) { condition = value; return q; }, orderBy() { return q; }, limit() { return Promise.resolve(rows()); }, then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); } };
    return q;
  },
  insert(table) { return { values(value) { state.trace.push(["insert", getTableName(table), value]); return { returning: async () => [{ id: 92, ...value, createdAt: new Date() }] }; } }; },
  update(table) { return { set(value) { return { where: async () => { state.trace.push(["update", getTableName(table), value]); } }; } }; },
};
Module._load = function(request, parent, isMain) {
  if (request === "@clerk/nextjs/server") return { auth: async () => ({ userId: state.signedIn ? "qa-clerk" : null }) };
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(root, "src/lib/db/index.ts")) return { db };
  if (request === "@/lib/notifications/dispatch" || resolved === path.join(root, "src/lib/notifications/dispatch.ts")) return { dispatchNotification: async input => { state.trace.push(["notification", input]); } };
  if (request === "@/lib/push/expo" || resolved === path.join(root, "src/lib/push/expo.ts")) return { sendPushToUser: async () => {} };
  if (request === "@/lib/email/templates/notification-email" || resolved === path.join(root, "src/lib/email/templates/notification-email.ts")) return { notificationEmail: data => data.message };
  return oldLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const legacy = require("../src/app/api/chat/route");
    const unified = require("../src/app/api/conversations/[id]/messages/route");
    const ctx = { params: Promise.resolve({ id: "50" }) };
    const req = (method, body, id = 257) => new NextRequest(`https://example.invalid/api/chat?booking_request_id=${id}`, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const tick = () => new Promise(resolve => setImmediate(resolve));
    let count = 0;
    const passed = label => { count++; console.log("PASS", label); };
    for (const kind of ["artist", "venue"]) {
      for (const actor of ["client", kind]) {
        for (const status of ["pending", "accepted", "cancelled", "rejected"]) {
          reset({ kind, actor, status });
          for (const route of [legacy, unified]) {
            const result = await route.GET(req("GET"), ctx);
            assert.equal(result.status, 200);
            const [message] = await result.json();
            assert.ok(!JSON.stringify(message).includes("qa@example.invalid"));
            assert.ok(!JSON.stringify(message).includes("+12025550123"));
            assert.equal(message.attachmentUrl, null);
            const blocked = await route.POST(req("POST", { bookingRequestId: 257, message: raw.message }), ctx);
            assert.equal(blocked.status, 422);
            assert.equal((await blocked.json()).code, "CONTACT_LOCKED");
          }
          assert.ok(!state.trace.some(entry => entry[0] === "insert" || entry[0] === "notification"));
        }
        passed(`${kind}/${actor}: both routes hide legacy contacts and block sends before final confirmation`);
        for (const status of ["confirmed_by_client", "completed"]) {
          reset({ kind, actor, status });
          for (const route of [legacy, unified]) {
            const list = await (await route.GET(req("GET"), ctx)).json();
            assert.equal(list[0].message, raw.message);
            assert.equal(list[0].attachmentUrl, raw.attachmentUrl);
            assert.equal((await route.POST(req("POST", { bookingRequestId: 257, message: raw.message }), ctx)).status, 201);
            await tick();
          }
        }
        passed(`${kind}/${actor}: both routes share contacts only after final confirmation`);
        reset({ kind, actor });
        for (const route of [legacy, unified]) {
          assert.equal((await route.POST(req("POST", { bookingRequestId: 257, message: "Nuntă, 60 invitați, buget 300 EUR, ora 14:00" }), ctx)).status, 201);
          await tick();
        }
        assert.equal(state.trace.filter(entry => entry[0] === "insert" && entry[1] === "chat_messages").length, 2);
        passed(`${kind}/${actor}: ordinary messages and notifications still work`);
      }
    }
    for (const route of [legacy, unified]) {
      for (const signedIn of [false, true]) {
        reset({ signedIn, actor: "outsider" });
        assert.equal((await route.GET(req("GET"), ctx)).status, signedIn ? 403 : 401);
        assert.equal((await route.POST(req("POST", { bookingRequestId: 257, message: "Hello" }), ctx)).status, signedIn ? 403 : 401);
        assert.deepEqual(state.trace, []);
      }
    }
    passed("both routes: unauthenticated and unrelated users cannot read/write");
    reset();
    for (const id of ["0", "-1", "NaN", "2.5", "9007199254740992"]) assert.equal((await legacy.GET(req("GET", null, id))).status, 400);
    assert.equal((await legacy.GET(req("GET", null, 999))).status, 403);
    for (const message of ["qa&#64;example.invalid", "<a href='https://example.md'>Contact</a>"]) {
      assert.equal((await legacy.POST(req("POST", { bookingRequestId: 257, message }))).status, 422);
    }
    passed("legacy route: malformed IDs, unrelated bookings and encoded contact attempts are rejected");
    assert.equal(raw.message, "Test QA contact fictiv: qa@example.invalid +12025550123", "stored history stays unchanged");
    console.log(`${count} chat contact regression groups passed; zero external operations`);
  } finally { Module._load = oldLoad; global.fetch = oldFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
