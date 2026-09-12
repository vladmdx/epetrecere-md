/** Real export handler with owner-scoped in-memory records. No DB or HTTP writes. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const root = path.resolve(__dirname, "..");
const oldLoad = Module._load;
const oldFetch = global.fetch;
const dialect = new PgDialect();
global.fetch = async () => { throw Error("External HTTP forbidden in regression tests"); };
let state;
const accounts = {
  client: { id: "client", clerkId: "clerk-client", name: "QA Client", email: "client@example.invalid", phone: "+12025550111", role: "user", languagePref: "en", createdAt: "2026-09-07" },
  artist: { id: "artist", clerkId: "clerk-artist", name: "QA Artist", email: "artist@example.invalid", phone: "+12025550122", role: "artist", languagePref: "en", createdAt: "2026-09-07" },
  venue: { id: "venue", clerkId: "clerk-venue", name: "QA Venue", email: "venue@example.invalid", phone: "+12025550133", role: "venue", languagePref: "en", createdAt: "2026-09-07" },
  stranger: { id: "stranger", clerkId: "clerk-stranger", name: "Unrelated", email: "unrelated@example.invalid", phone: "+12025550144", role: "user", languagePref: "en", createdAt: "2026-09-07" },
};
const artistProfiles = [561, 562].map(id => ({ id, userId: "artist", contactEmail: accounts.artist.email, phone: accounts.artist.phone, description: "Own artist profile with artist@example.invalid" }));
const venueProfiles = [45, 46].map(id => ({ id, userId: "venue", email: accounts.venue.email, phone: accounts.venue.phone, description: "Own venue profile with venue@example.invalid" }));
function booking(id, target, status) {
  const vendor = target === "artist" ? accounts.artist : accounts.venue;
  return { id, clientUserId: "client", artistId: target === "artist" ? 561 : null, venueId: target === "venue" ? 45 : null,
    status, updatedAt: "2026-09-07T16:00:00Z", clientName: "Client client@example.invalid", clientPhone: accounts.client.phone,
    clientEmail: accounts.client.email, message: `Client note ${accounts.client.email} ${accounts.client.phone}`,
    artistReply: `Vendor reply ${vendor.email} ${vendor.phone}`, adminNotes: "Internal admin-secret@example.invalid +12025550199",
    clientSignature: "Signed Client client@example.invalid", contractPdfUrl: `https://example.invalid/private-contract-${id}.pdf`,
    clientSignedAt: "2026-09-07T12:00:00Z", eventDate: "2026-09-20", startTime: "14:00", endTime: "00:00", agreedPrice: 300,
    priceOffers: [{ from: "client", amount: 250, at: "2026-09-07T12:00:00Z", message: accounts.client.email }, { from: "artist", amount: 300, at: "2026-09-07T13:00:00Z", message: vendor.email }] };
}
function reset(actor = "client", status = "pending", extra = {}) {
  const user = accounts[actor];
  const bookings = [booking(257, "artist", status), booking(256, "venue", status)];
  const conversations = [
    { id: 50, clientUserId: "client", artistId: 561, venueId: null, lastMessagePreview: "Contact artist@example.invalid" },
    { id: 51, clientUserId: "client", artistId: null, venueId: 45, lastMessagePreview: "Contact venue@example.invalid" },
    { id: 52, clientUserId: "client", artistId: 562, venueId: null, lastMessagePreview: "Contact artist@example.invalid" },
    { id: 53, clientUserId: "client", artistId: null, venueId: 46, lastMessagePreview: "Contact venue@example.invalid" },
  ];
  const messages = conversations.flatMap((conv, index) => ["client", conv.artistId ? "artist" : "venue"].map((senderType, j) => ({
    id: index * 2 + j + 1, bookingRequestId: index < 2 ? (index ? 256 : 257) : null,
    conversationId: conv.id, senderType, senderName: accounts[senderType].email,
    message: `Own record ${accounts[senderType].email} ${accounts[senderType].phone}`,
    attachmentUrl: `https://example.invalid/${senderType}-private.pdf`, attachmentName: accounts[senderType].email,
    attachmentMime: "application/pdf", isRead: false, createdAt: "2026-09-07T15:00:00Z",
  })));
  const ownAgreement = { id: 90, userId: user.id, documentHtml: "<p>Exact signed text: legal@example.invalid</p>", documentSnapshot: { body: "Unchanged original — with punctuation", phone: "+12025550999" }, signatureData: "data:image/png;base64,EXACT", ipAddress: "192.0.2.1", userAgent: "QA device", acceptedAt: "2026-09-07T12:00:00Z" };
  const peer = actor === "client" ? accounts.artist : accounts.client;
  state = { actor, user, bookings, conversations, messages, ownAgreement, calls: [], authed: true, missingUser: false,
    notifications: [{ id: 1, userId: user.id, type: "booking_message", title: `From ${peer.email}`, message: `Phone ${peer.phone}`, actionUrl: `/en/${actor === "client" ? "cabinet" : "dashboard"}/rezervari?expand=${actor === "venue" ? 256 : 257}` }], ...extra };
}
function ownsParty(row) {
  return row.clientUserId === state.user.id || (state.actor === "artist" && [561, 562].includes(row.artistId)) || (state.actor === "venue" && [45, 46].includes(row.venueId));
}
const db = {
  select(projection) {
    let table, condition, joined = false;
    const rows = () => {
      const name = getTableName(table);
      assert.ok(condition, `${name} query must be scoped`);
      const query = dialect.sqlToQuery(condition);
      const { sql, params } = query;
      state.calls.push({ name, sql, params });
      if (name === "users") {
        if (projection?.role) { assert.ok(params.includes(state.user.id)); return [{ role: state.user.role }]; }
        assert.ok(params.includes(state.user.clerkId)); return state.missingUser ? [] : [state.user];
      }
      if (name === "artists" || name === "venues") {
        assert.ok(params.includes(state.user.id), "profile ownership guard");
        return (name === "artists" ? artistProfiles : venueProfiles).filter(p => p.userId === state.user.id);
      }
      if (name === "booking_requests" || name === "conversations") {
        const source = name === "booking_requests" ? state.bookings : state.conversations;
        if (joined) { assert.ok(params.includes(state.user.id), "notification relation ownership guard"); return source.filter(ownsParty); }
        if (sql.includes('"client_user_id"')) { assert.ok(params.includes(state.user.id)); return source.filter(row => row.clientUserId === state.user.id); }
        const ownIds = state.actor === "artist" ? [561, 562] : state.actor === "venue" ? [45, 46] : [];
        assert.ok(ownIds.length > 0 && params.every(p => ownIds.includes(p)), "only own vendor IDs may scope export");
        assert.match(sql, state.actor === "artist" ? /"artist_id"/ : /"venue_id"/);
        return source.filter(ownsParty);
      }
      if (name === "chat_messages") {
        const viaConversation = sql.includes('"conversation_id"');
        const ownedIds = (viaConversation ? state.conversations : state.bookings).filter(ownsParty).map(row => row.id);
        assert.ok(params.every(id => ownedIds.includes(id)), "chat export must use owned relation IDs only");
        return state.messages.filter(message => params.includes(viaConversation ? message.conversationId : message.bookingRequestId));
      }
      if (name === "notifications") { assert.ok(params.includes(state.user.id)); return state.actor === "stranger" ? [] : state.notifications; }
      if (name === "legal_acceptances") { assert.ok(params.includes(state.user.id)); return [state.ownAgreement]; }
      // The non-chat personal records are out of this regression's scope.
      return [];
    };
    const query = { from(value) { table = value; return query; }, leftJoin() { joined = true; return query; }, innerJoin() { joined = true; return query; }, where(value) { condition = value; return query; }, orderBy() { return query; }, limit() { return Promise.resolve(rows()); }, then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); } };
    return query;
  },
  // Intentionally no insert/update/delete: any mutation fails immediately.
};
Module._load = function(request, parent, isMain) {
  let resolved; try { resolved = Module._resolveFilename(request, parent); } catch {}
  if (request === "@/lib/db" || resolved === path.join(root, "src/lib/db/index.ts")) return { db };
  if (request === "@clerk/nextjs/server") return { auth: async () => ({ userId: state.authed ? state.user.clerkId : null }) };
  if (request === "@/lib/privacy/guest-encryption" || resolved === path.join(root, "src/lib/privacy/guest-encryption.ts")) return { revealGuestListRecord: row => row, revealInvitationGuestRecord: row => row };
  return oldLoad.call(this, request, parent, isMain);
};
(async () => {
  try {
    const api = require("../src/app/api/me/data-export/route");
    const { bookingForDataExport, dataExportChatProjection } = require("../src/lib/privacy/export-contact");
    const { chatMessageForViewer } = require("../src/lib/privacy/chat-message");
    let groups = 0;
    const passed = label => { groups++; console.log("PASS", label); };
    const get = async () => { const response = await api.GET(); assert.equal(response.status, 200); assert.match(response.headers.get("Content-Disposition"), /attachment/); return response.json(); };
    for (const actor of ["client", "artist", "venue"]) {
      for (const status of ["pending", "accepted", "rejected", "cancelled"]) {
        reset(actor, status);
        const source = JSON.stringify({ bookings: state.bookings, conversations: state.conversations, messages: state.messages, ownAgreement: state.ownAgreement });
        const result = await get();
        assert.equal(result.profile.email, state.user.email);
        assert.equal(result.profile.phone, state.user.phone);
        assert.deepEqual(result.legalAcceptances, [state.ownAgreement], "signed account agreement is exact");
        const profiles = actor === "artist" ? result.vendorProfiles.artists : result.vendorProfiles.venues;
        if (actor !== "client") assert.equal(profiles[0].phone, state.user.phone);
        assert.equal(result.bookingRequests.length, actor === "client" ? 2 : 1);
        for (const row of result.bookingRequests) {
          const original = state.bookings.find(b => b.id === row.id);
          assert.equal(row.adminNotes, null);
          assert.equal(row.contractPdfUrl, null);
          assert.equal(row.agreedPrice, 300);
          assert.equal(row.startTime, "14:00");
          assert.equal(row.clientPhone, actor === "client" ? accounts.client.phone : null);
          assert.equal(row.clientEmail, actor === "client" ? accounts.client.email : null);
          assert.equal(row.clientSignature, actor === "client" ? original.clientSignature : null);
          assert.equal(row.clientSignedAt, original.clientSignedAt);
          const ownField = actor === "client" ? "message" : "artistReply";
          const otherField = actor === "client" ? "artistReply" : "message";
          assert.equal(row[ownField], original[ownField]);
          assert.ok(!row[otherField].includes("@example.invalid"));
          for (let i = 0; i < row.priceOffers.length; i++) {
            assert.equal(row.priceOffers[i].amount, original.priceOffers[i].amount);
            const own = row.priceOffers[i].from === (actor === "client" ? "client" : "artist");
            if (own) assert.deepEqual(row.priceOffers[i], original.priceOffers[i]);
            else assert.ok(!row.priceOffers[i].message.includes("@example.invalid"));
          }
        }
        assert.equal(result.conversations.length, actor === "client" ? 4 : 2, "vendor pre-booking conversations included");
        assert.equal(result.messages.length, actor === "client" ? 8 : 4, "conversation-only and legacy messages included once");
        for (const row of result.messages) {
          const original = state.messages.find(m => m.id === row.id);
          if (row.senderType === actor) assert.deepEqual(row, original, "own message and attachment preserved exactly");
          else { assert.ok(!JSON.stringify(row).includes("@example.invalid")); assert.equal(row.attachmentUrl, null); }
        }
        assert.ok(result.conversations.every(c => !c.lastMessagePreview.includes("@example.invalid")));
        assert.ok(!JSON.stringify(result.notifications).includes("@example.invalid"));
        assert.equal(JSON.stringify({ bookings: state.bookings, conversations: state.conversations, messages: state.messages, ownAgreement: state.ownAgreement }), source, "stored history unchanged");
      }
      passed(`${actor}: all pre-confirmation statuses hide counterpart contacts/metadata, own data and signed agreements exact`);
    }
    for (const actor of ["client", "artist", "venue"]) {
      for (const status of ["confirmed_by_client", "completed"]) {
        reset(actor, status);
        const result = await get();
        for (const row of result.bookingRequests) assert.deepEqual(row, { ...state.bookings.find(b => b.id === row.id), adminNotes: null });
        for (const row of result.messages.filter(m => m.bookingRequestId)) assert.deepEqual(row, state.messages.find(m => m.id === row.id));
        assert.deepEqual(result.notifications, state.notifications);
        assert.deepEqual(result.legalAcceptances, [state.ownAgreement]);
      }
    }
    passed("final confirmation/completion expose agreed contacts and booking PDF, never internal admin notes");
    reset("stranger");
    const empty = await get();
    assert.deepEqual(empty.bookingRequests, []); assert.deepEqual(empty.messages, []); assert.deepEqual(empty.conversations, []);
    reset("client", "pending", { authed: false });
    assert.equal((await api.GET()).status, 401); assert.equal(state.calls.length, 0);
    reset("client", "pending", { missingUser: true });
    assert.equal((await api.GET()).status, 404); assert.equal(state.calls.length, 1);
    passed("unrelated account gets no other-party records; authentication and missing-user gates retained");
    reset();
    const owner = { userId: "client", artistIds: [], venueIds: [] };
    const older = { ...state.bookings[0], id: 1, status: "completed" };
    const projected = dataExportChatProjection([state.conversations[0]], [{ ...state.messages[1], bookingRequestId: null }], [older, state.bookings[0]], owner);
    assert.ok(!projected.messages[0].message.includes("artist@example.invalid"), "equal updatedAt uses newest ID, not older completed booking");
    const unknown = dataExportChatProjection([], [{ ...state.messages[1], bookingRequestId: 999, conversationId: 999 }], state.bookings, owner);
    assert.equal(unknown.messages[0].attachmentUrl, null);
    const encoded = chatMessageForViewer({ message: "Hello", senderName: "QA", attachmentUrl: null, attachmentName: "qa&#64;example.invalid" }, false);
    assert.ok(!encoded.attachmentName.includes("example.invalid"));
    assert.equal(bookingForDataExport({ ...state.bookings[0], status: "completed" }, owner).adminNotes, null);
    const detail = readFileSync(path.join(root, "src/app/api/conversations/[id]/messages/route.ts"), "utf8");
    assert.match(detail, /orderBy\(desc\(bookingRequests\.updatedAt\), desc\(bookingRequests\.id\)\)/);
    passed("tie-break, unknown relationship and encoded attachment-name bypasses fail closed");
    console.log(`${groups} data-export contact regression groups passed; zero external operations`);
  } finally { Module._load = oldLoad; global.fetch = oldFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
