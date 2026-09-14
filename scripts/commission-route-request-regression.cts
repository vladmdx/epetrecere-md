/** Request-level commissions GET regression with in-memory auth and DB. */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";

const loadAfterMocks = createRequire(__filename);
const root = path.resolve(__dirname, "..");
const oldLoad = Module._load;
const oldFetch = global.fetch;
global.fetch = async () => {
  throw new Error("No external requests allowed");
};
const dialect = new PgDialect();

const allItems = [
  commissionRow(1, { venueId: 10, bookingStatus: "pending", clientName: "Private One" }),
  commissionRow(2, { venueId: 20, bookingStatus: "confirmed_by_client", clientName: "Visible Two" }),
  commissionRow(3, { venueId: 30, bookingStatus: "completed", clientName: "Other Org" }),
  commissionRow(4, { artistId: 90, bookingStatus: "pending", clientName: "Private Artist" }),
];

const admin = false;
let artistId = 90;
let allowedVenueIds = [10, 20];
let deniedVenueIds = new Set();
let commissionReads = 0;
const listCalls = [];
const authorizeCalls = [];

function commissionRow(id, overrides) {
  return {
    id,
    bookingRequestId: id + 1000,
    vendorType: overrides.artistId ? "artist" : "venue",
    artistId: overrides.artistId ?? null,
    venueId: overrides.venueId ?? null,
    baseAmount: 100,
    currency: "EUR",
    rateBps: 500,
    amount: 5,
    guestCount: 20,
    tier: "qa",
    status: "pending",
    dueDate: null,
    paidAt: null,
    paymentMethod: null,
    paymentNote: null,
    createdAt: new Date("2026-09-15T00:00:00Z"),
    clientName: overrides.clientName,
    clientEmail: `${id}@example.invalid`,
    eventDate: "2026-09-20",
    bookingStatus: overrides.bookingStatus,
    artistName: overrides.artistId ? "QA Artist" : null,
    venueName: overrides.venueId ? `Venue ${overrides.venueId}` : null,
  };
}

function currentScopeRows() {
  if (admin) return allItems;
  return allItems.filter((item) =>
    (artistId != null && item.artistId === artistId)
    || (item.venueId != null && allowedVenueIds.includes(item.venueId)),
  );
}

const db = {
  select(projection) {
    let table;
    let condition;
    const result = () => {
      const tableName = getTableName(table);
      if (tableName === "artists") {
        return artistId == null ? [] : [{ id: artistId }];
      }
      if (tableName !== "commissions") {
        throw new Error(`Unexpected select from ${tableName}`);
      }
      commissionReads += 1;
      let rows = currentScopeRows();
      if (condition) {
        const query = dialect.sqlToQuery(condition);
        if (/"commissions"\."venue_id"\s*=/.test(query.sql)) {
          const exactVenueId = query.params.find((value) => typeof value === "number");
          rows = rows.filter((item) => item.venueId === exactVenueId);
        }
      }
      if (Object.prototype.hasOwnProperty.call(projection, "pending")) {
        return [{
          pending: rows.reduce((sum, item) => sum + item.amount, 0),
          paid: 0,
          overdue: 0,
          count: rows.length,
        }];
      }
      return rows;
    };
    const chain = {
      from(value) {
        table = value;
        return chain;
      },
      leftJoin() {
        return chain;
      },
      where(value) {
        condition = value;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(value) {
        return Promise.resolve(result().slice(0, value));
      },
      then(resolve, reject) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return chain;
  },
};

Module._load = function (request, parent, isMain) {
  if (request === "@/lib/db") return { db };
  if (request === "@/lib/auth/admin") {
    return {
      requireAdmin: async () => admin
        ? { ok: true, userId: "global-admin" }
        : { ok: false, status: 403, error: "Forbidden" },
    };
  }
  if (request === "@/lib/venue-access") {
    return {
      getCurrentAppUser: async () => ({ id: "vendor-user", role: "user", isGlobalAdmin: false }),
      listVenueIdsForCapability: async (userId, capability) => {
        listCalls.push({ userId, capability });
        return [...allowedVenueIds];
      },
      authorizeVenueCapability: async (user, venueId, capability) => {
        authorizeCalls.push({ userId: user.id, venueId, capability });
        return deniedVenueIds.has(venueId)
          ? { ok: false, status: 403, error: "Forbidden" }
          : { ok: true, venueId, role: "admin" };
      },
    };
  }
  if (request === "@/lib/commissions/service") {
    return {
      markCommissionPaid: async () => undefined,
      setCommissionStatus: async () => undefined,
    };
  }
  return oldLoad.call(this, request, parent, isMain);
};

async function get(api, suffix = "") {
  return api.GET(new NextRequest(`https://example.invalid/api/commissions${suffix}`));
}

(async () => {
  try {
    const api = loadAfterMocks(path.join(root, "src/app/api/commissions/route.ts"));

    let response = await get(api);
    assert.equal(response.status, 200);
    let payload = await response.json();
    assert.deepEqual(payload.items.map((item) => item.id), [1, 2, 4]);
    assert.equal(payload.items.find((item) => item.id === 1).clientName, null);
    assert.equal(payload.items.find((item) => item.id === 1).clientEmail, null);
    assert.equal(payload.items.find((item) => item.id === 2).clientName, "Visible Two");
    assert.deepEqual(listCalls, [{ userId: "vendor-user", capability: "manage_financials" }]);

    artistId = 90;
    allowedVenueIds = [20];
    response = await get(api, "?venueId=20");
    assert.equal(response.status, 200);
    payload = await response.json();
    assert.deepEqual(payload.items.map((item) => item.id), [2]);
    assert.deepEqual(authorizeCalls.at(-1), {
      userId: "vendor-user",
      venueId: 20,
      capability: "manage_financials",
    });

    deniedVenueIds = new Set([30]);
    const readsBeforeDenied = commissionReads;
    response = await get(api, "?venueId=30");
    assert.equal(response.status, 403);
    assert.equal(commissionReads, readsBeforeDenied);

    const readsBeforeInvalid = commissionReads;
    response = await get(api, "?venueId=abc");
    assert.equal(response.status, 400);
    assert.equal(commissionReads, readsBeforeInvalid);

    artistId = null;
    allowedVenueIds = [];
    deniedVenueIds = new Set();
    response = await get(api);
    assert.equal(response.status, 200);
    payload = await response.json();
    assert.deepEqual(payload.items, []);
    assert.deepEqual(payload.totals, { pending: 0, paid: 0, overdue: 0, count: 0 });

    console.log("PASS commissions GET enforces request-level financial scopes and PII redaction");
  } finally {
    Module._load = oldLoad;
    global.fetch = oldFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
