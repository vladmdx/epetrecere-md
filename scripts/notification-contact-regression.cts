/** Read-only projection tests, real notification APIs with in-memory DB/auth. */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";

const loadAfterMocks = createRequire(__filename);
const root = path.resolve(__dirname, "..");
const oldLoad = Module._load;
const oldFetch = global.fetch;
global.fetch = async () => { throw Error("No external requests allowed"); };
const dialect = new PgDialect();
let state;
const note = (actionUrl) => ({ id: 10, userId: "viewer", type: "booking_request_new", title: "Mesaj de la qa@example.invalid", message: "QA phone +12025550123", actionUrl, isRead: false, createdAt: new Date() });
function reset(extra = {}) { state = { role: "user", ownsVenue: false, ownsArtist: false, status: "pending", ownsRelation: true, authed: true, calls: [], items: [note("/en/dashboard/mesaje?conversation=50")], ...extra }; }
const db = {
  select(projection) {
    let table, condition;
    const rows = () => {
      const name = getTableName(table);
      const params = condition ? dialect.sqlToQuery(condition).params : [];
      state.calls.push({ name, params });
      if (name === "users") { assert.ok(params.includes("viewer")); return [{ role: state.role }]; }
      if (name === "partner_organization_members" || name === "partner_organizations") return [];
      if (name === "venues" || name === "artists") {
        assert.ok(params.includes("viewer"), "actual profile ownership is checked");
        return (name === "venues" ? state.ownsVenue : state.ownsArtist) ? [{ id: 45 }] : [];
      }
      if (name === "notifications") { assert.ok(params.includes("viewer")); return projection?.count ? [{ count: 1 }] : state.items; }
      if (name === "conversations") {
        assert.ok(params.includes("viewer"), "conversation ownership enforced in SQL");
        return state.ownsRelation ? [{ id: 50, clientUserId: "client", artistId: 561, venueId: null }] : [];
      }
      if (name === "booking_requests") {
        assert.ok(params.includes("viewer"), "booking ownership enforced in SQL");
        return state.ownsRelation ? [
          { id: 257, clientUserId: "client", artistId: 561, venueId: null, status: state.status },
          { id: 12, clientUserId: "client", artistId: 561, venueId: null, status: "completed" },
        ] : [];
      }
      throw Error(`Unexpected select ${name}`);
    };
    const q = { from(value) { table = value; return q; }, leftJoin() { return q; }, innerJoin() { return q; }, where(value) { condition = value; return q; }, orderBy() { return q; }, limit() { return Promise.resolve(rows()); }, then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); } };
    return q;
  },
  update(table) { assert.equal(getTableName(table), "notifications"); return { set(value) { assert.deepEqual(value, { isRead: true }); return { where() { return { returning: async () => state.items }; } }; } }; },
};
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(root, "src/lib/db/index.ts")) return { db };
  if (request === "@/lib/planner/ownership" || resolved === path.join(root, "src/lib/planner/ownership.ts")) return { requireAppUser: async () => state.authed ? { ok: true, userId: "viewer" } : { ok: false, status: 401, error: "Unauthorized" } };
  return oldLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const { notificationsForUser } = loadAfterMocks("../src/lib/privacy/notification-view");
    const { notificationContext, notificationHasContact, conversationPartyKey } = loadAfterMocks("../src/lib/privacy/notification-context");
    const api = loadAfterMocks("../src/app/api/notifications/route");
    const single = loadAfterMocks("../src/app/api/notifications/[id]/route");
    const req = new NextRequest("https://example.invalid/api/notifications");
    let count = 0;
    const passed = label => { count++; console.log("PASS", label); };
    for (const status of ["pending", "accepted", "rejected", "cancelled"]) {
      reset({ status });
      const original = JSON.stringify(state.items);
      const visible = await notificationsForUser(state.items, "viewer");
      assert.ok(!JSON.stringify(visible).includes("qa@example.invalid"));
      assert.ok(!JSON.stringify(visible).includes("+12025550123"));
      assert.equal(JSON.stringify(state.items), original);
    }
    passed("historical text stays hidden before bilateral confirmation, even with an older completed booking");
    for (const status of ["confirmed_by_client", "completed"]) {
      for (const actionUrl of ["/cabinet/mesaje?conversation=50", "/ru/dashboard/sala/rezervari?expand=257"]) {
        reset({ status, items: [note(actionUrl)] });
        assert.deepEqual(await notificationsForUser(state.items, "viewer"), state.items);
      }
    }
    passed("owned linked conversation/direct booking reveal text only after bilateral confirmation");
    for (const actionUrl of [null, "/cabinet/rezervari", "https://evil.invalid/cabinet/mesaje?conversation=50", "/cabinet/mesaje?conversation=-1"]) {
      reset({ status: "completed", items: [note(actionUrl)] });
      assert.ok(!JSON.stringify(await notificationsForUser(state.items, "viewer")).includes("qa@example.invalid"));
    }
    reset({ status: "completed", ownsRelation: false });
    assert.ok(!JSON.stringify(await notificationsForUser(state.items, "viewer")).includes("qa@example.invalid"));
    passed("unrelated or ambiguous legacy links fail closed; no global confirmed-booking unlock");
    const legacy = [
      { ...note("/en/dashboard/rezervari?expand=257"), type: "booking_request_new", title: "QA a propus un preț", message: "300 EUR" },
      { ...note("/en/dashboard"), type: "registration_approved", title: "Sala ta a fost aprobată", message: "Bine ai venit" },
    ];
    reset({ ownsVenue: true, items: legacy });
    const originalLinks = JSON.stringify(legacy);
    const routed = await notificationsForUser(legacy, "viewer");
    assert.deepEqual(routed.map(item => item.actionUrl), ["/en/dashboard/sala/rezervari?expand=257", "/en/dashboard/sala"]);
    assert.equal(JSON.stringify(legacy), originalLinks, "historical rows remain unchanged");
    for (const role of ["artist", "user", "admin", "super_admin"]) {
      reset({ role, items: legacy });
      assert.deepEqual(await notificationsForUser(legacy, "viewer"), legacy);
    }
    reset({ ownsVenue: true, ownsArtist: true, items: legacy });
    assert.deepEqual(await notificationsForUser(legacy, "viewer"), legacy, "dual-profile history is not guessed");
    reset({ ownsVenue: true, items: legacy });
    const routedGet = await api.GET(req);
    assert.equal((await routedGet.json()).notifications[0].actionUrl, "/en/dashboard/sala/rezervari?expand=257");
    const routedPatch = await single.PATCH(req, { params: Promise.resolve({ id: "10" }) });
    assert.match(JSON.stringify(await routedPatch.json()), /\/en\/dashboard\/sala/);
    passed("verified venue ownership gets corrected historical links in GET/PATCH; other/ambiguous profiles and stored history unchanged");
    for (const role of ["admin", "super_admin"]) {
      reset({ role });
      assert.deepEqual(await notificationsForUser(state.items, "viewer"), state.items);
      assert.equal(state.calls.length, 1);
    }
    passed("verified administrators retain complete notifications");
    reset({ items: [{ ...note(null), title: "Cerere nouă", message: "Nuntă, 60 invitați, 300 EUR" }] });
    assert.deepEqual(await notificationsForUser(state.items, "viewer"), state.items);
    assert.equal(state.calls.length, 0);
    assert.equal(notificationHasContact({ ...note(null), title: "Nou", message: "qa&#64;example.invalid" }), true);
    assert.equal(notificationHasContact({ ...note(null), title: "Nou", message: "<a href='https://example.md'>Contact</a>" }), true);
    passed("ordinary alerts require no extra query; encoded/HTML contacts still trigger privacy projection");
    reset();
    const get = await api.GET(req);
    assert.equal(get.status, 200);
    const payload = await get.json();
    assert.equal(payload.unreadCount, 1);
    assert.ok(!JSON.stringify(payload).includes("qa@example.invalid"));
    const patch = await single.PATCH(req, { params: Promise.resolve({ id: "10" }) });
    assert.equal(patch.status, 200);
    assert.ok(!JSON.stringify(await patch.json()).includes("qa@example.invalid"));
    reset({ authed: false });
    assert.equal((await api.GET(req)).status, 401);
    assert.equal((await single.PATCH(req, { params: Promise.resolve({ id: "10" }) })).status, 401);
    assert.equal(state.calls.length, 0);
    passed("real GET and mark-read response redact historical contact text and preserve auth/unread count");
    assert.deepEqual(notificationContext("https://epetrecere.md/en/dashboard/mesaje?conversation=50"), { kind: "conversation", id: 50 });
    assert.deepEqual(notificationContext("/dashboard/locatii/88/mesaje?conversation=9"), { kind: "conversation", id: 9 });
    assert.deepEqual(notificationContext("/ru/dashboard/locatii/88/mesaje?conversation=9"), { kind: "conversation", id: 9 });
    assert.equal(notificationContext("/dashboard/locatii/0/mesaje?conversation=9"), null);
    assert.equal(notificationContext("/dashboard/locatii/88/mesaje-extra?conversation=9"), null);
    assert.equal(notificationContext("https://evil.invalid/dashboard/locatii/88/mesaje?conversation=9"), null);
    assert.notEqual(conversationPartyKey("client", 10, null), conversationPartyKey("client", null, 10));
    assert.equal(conversationPartyKey("client", 10, 20), null);
    assert.equal(conversationPartyKey("client", null, null), null);
    const venue = readFileSync("src/lib/db/queries/venue-bookings.ts", "utf8");
    const linked = venue.slice(venue.indexOf("const linkedRows"), venue.indexOf("// Count accepted bookings"));
    assert.doesNotMatch(linked, /"accepted"/);
    assert.match(linked, /"confirmed_by_client"/);
    assert.match(linked, /"completed"/);
    assert.match(venue.slice(venue.indexOf("// Count accepted bookings")), /"accepted", "confirmed_by_client"/);
    const activity = readFileSync("src/lib/db/queries/venue-stats.ts", "utf8");
    assert.match(activity, /return notificationsForUser\(rows, userId\)/);
    const previews = readFileSync("src/app/api/conversations/route.ts", "utf8");
    assert.match(previews, /contactsAreShared\(linkedBooking\.status\)/);
    assert.match(previews, /redactContact\(plainText\(r\.lastMessagePreview\)\)/);
    assert.match(previews, /orderBy\(desc\(bookingRequests\.updatedAt\), desc\(bookingRequests\.id\)\)/);
    passed("venue activity and inbox previews protected; linked artist count excludes merely accepted requests");
    console.log(`${count} notification/privacy regression groups passed; zero external operations`);
  } finally { Module._load = oldLoad; global.fetch = oldFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
