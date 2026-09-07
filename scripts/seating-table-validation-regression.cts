/** Real POST/PATCH handlers against in-memory owner-scoped mocks, no DB writes. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const { getTableName } = require("drizzle-orm");
const { PgDialect } = require("drizzle-orm/pg-core");
const oldLoad = Module._load;
const oldFetch = global.fetch;
global.fetch = async () => { throw Error("External HTTP forbidden"); };
const dialect = new PgDialect();
let allowed = true, occupants = [], writes = [], transactions = 0, locks = 0;
let storedTables = [];
const db = {
  select(projection) {
    let tableName;
    const rows = () => tableName === "seating_tables" && !projection ? storedTables : [];
    const q = { from(table) { tableName = getTableName(table); return q; },
      innerJoin() { return q; },
      where(condition) { assert.deepEqual(dialect.sqlToQuery(condition).params, [99]); return q; },
      orderBy() { return q; }, limit() { return Promise.resolve(rows()); },
      then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); } }; return q;
  },
  insert(table) { assert.equal(getTableName(table), "seating_tables"); return { values(value) {
    assert.equal(value.planId, 99); writes.push(value); return { returning: async () => {
      const created = { id: 11 + storedTables.length, ...value }; storedTables.push(created); return [created];
    } };
  } }; },
  update(table) { assert.equal(getTableName(table), "seating_tables"); return { set(value) { return { where(condition) {
    assert.deepEqual(dialect.sqlToQuery(condition).params, [11, 99]); writes.push(value);
    return { returning: async () => {
      const row = { ...(storedTables.find(table => table.id === 11) || { id: 11, planId: 99 }), ...value };
      storedTables = storedTables.map(table => table.id === 11 ? row : table); return [row];
    } };
  } }; } }; },
  transaction(run) { transactions++; return run(db); },
};
Module._load = function(request, parent, isMain) {
  if (request === "@/lib/db") return { db };
  if (request === "@/lib/privacy/guest-encryption") return { revealGuestListRecord: () => { throw Error("Guest data outside test scope"); } };
  if (request === "@/lib/planner/ownership") return { requirePlanOwnership: async planId => {
    assert.equal(planId, 99); return allowed ? { ok: true, userId: "qa-owner", plan: { id: 99, seatsPerTable: 10 } } : { ok: false, error: "Forbidden", status: 403 };
  } };
  if (request === "@/lib/planner/seating-capacity") return {
    lockSeatingPlan: async (tx, planId, userId) => { assert.equal(tx, db); assert.equal(planId, 99); assert.equal(userId, "qa-owner"); locks++; return true; },
    tableOccupants: async (tx, planId, tableId) => { assert.equal(tx, db); assert.equal(planId, 99); assert.equal(tableId, 11); return occupants; },
  };
  return oldLoad.call(this, request, parent, isMain);
};
(async () => {
  try {
    const { POST } = require("../src/app/api/event-plans/[id]/tables/route");
    const { PATCH } = require("../src/app/api/event-plans/[id]/tables/[tableId]/route");
    const { GET } = require("../src/app/api/event-plans/[id]/route");
    const context = { params: Promise.resolve({ id: "99", tableId: "11" }) };
    const request = (method, seats, extra = {}) => new Request("https://example.invalid/api/event-plans/99/tables/11", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "QA table", seats, ...extra }),
    });
    for (const [method, handler] of [["POST", POST], ["PATCH", PATCH]]) {
      for (const seats of [1, 30]) {
        writes = []; transactions = 0; locks = 0;
        const response = await handler(request(method, seats), context);
        assert.equal(response.status, method === "POST" ? 201 : 200);
        assert.equal((await response.json()).table.seats, seats);
        assert.equal(writes.length, 1); assert.equal(writes[0].seats, seats);
        if (method === "PATCH") { assert.equal(transactions, 1); assert.equal(locks, 1); }
      }
      for (const seats of [0, 31, 1.5, -1, "1"]) {
        writes = []; transactions = 0;
        assert.equal((await handler(request(method, seats), context)).status, 400, `${method} ${seats}`);
        assert.equal(writes.length, 0); assert.equal(transactions, 0);
      }
      console.log(`PASS real ${method}: integers 1/30 accepted; 0/31/fractions/negative/string rejected without mutation`);
    }
    storedTables = [];
    for (const shape of ["round", "rectangular", "long"]) {
      const created = await POST(request("POST", 10, { shape }), context);
      assert.equal(created.status, 201); assert.equal((await created.json()).table.shape, shape);
    }
    const reloaded = await GET(new Request("https://example.invalid/api/event-plans/99"), context);
    assert.equal(reloaded.status, 200);
    assert.deepEqual((await reloaded.json()).tables.map(table => table.shape), ["round", "rectangular", "long"]);
    for (const shape of ["long", "rectangular", "round"]) {
      assert.equal((await PATCH(request("PATCH", undefined, { shape }), context)).status, 200);
      assert.equal((await (await GET(new Request("https://example.invalid/api/event-plans/99"), context)).json()).tables[0].shape, shape);
    }
    for (const [method, handler] of [["POST", POST], ["PATCH", PATCH]]) {
      for (const shape of ["circle", "ROUND", "", null, 1]) {
        writes = [];
        assert.equal((await handler(request(method, 10, { shape }), context)).status, 400);
        assert.equal(writes.length, 0);
      }
    }
    const legacy = await POST(request("POST", 14), context);
    assert.equal((await legacy.json()).table.shape, null, "old clients remain compatible without inventing a stored shape");
    assert.equal((await PATCH(request("PATCH", 14), context)).status, 200);
    assert.equal(storedTables[0].shape, "round", "shape-less patch keeps the saved preference");
    console.log("PASS shapes persist through real create/PATCH/owner GET reload; invalid shapes rejected and omitted legacy shape preserved");
    occupants = [{ id: 1, partySize: 2 }]; writes = [];
    const full = await PATCH(request("PATCH", 1), context);
    assert.equal(full.status, 400); assert.equal((await full.json()).code, "TABLE_FULL"); assert.equal(writes.length, 0);
    allowed = false; writes = []; transactions = 0;
    assert.equal((await POST(request("POST", 1), context)).status, 403);
    assert.equal((await PATCH(request("PATCH", 1), context)).status, 403);
    assert.equal(writes.length, 0); assert.equal(transactions, 0);
    console.log("PASS existing owner authorization and occupied-capacity protection remain intact");
  } finally { Module._load = oldLoad; global.fetch = oldFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
