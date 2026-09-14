/** Request-level GET /api/legal/accept regression with in-memory auth and DB. */
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
const rows = [
  legalRow(101, 1),
  legalRow(202, 2),
  legalRow(303, null),
  legalRow(404, null, "other-user"),
];

let accessMode = "owner";
let legalReads = 0;
const accessCalls = [];

function legalRow(id, organizationId, userId = "app-user") {
  return {
    id,
    userId,
    organizationId,
    subjectType: "venue",
    documentSlug: `qa-scope-${id}`,
    documentVersion: "v0",
    packVersion: "v0",
    locale: "ro",
    signatureName: "QA Signer",
    signatureImage: null,
    representativeRole: null,
    partnerType: null,
    legalName: null,
    idNumber: null,
    legalAddress: null,
    representativeName: null,
    documentTitleStored: `QA ${id}`,
    documentBlocks: null,
    deviceSummary: null,
    acceptedAt: new Date("2026-09-15T00:00:00Z"),
    ipAddress: null,
    userAgent: null,
    email: null,
    phone: null,
    contentHash: null,
    acceptanceSessionId: "11111111-1111-4111-8111-111111111111",
  };
}

function selectedLegalRow(row) {
  const { userId: _userId, ...selected } = row;
  return selected;
}

const db = {
  select() {
    let table;
    let condition;
    const result = () => {
      const tableName = getTableName(table);
      const query = condition ? dialect.sqlToQuery(condition) : { sql: "", params: [] };
      if (tableName === "users") {
        return query.params.includes("clerk-user") ? [{ id: "app-user" }] : [];
      }
      if (tableName !== "legal_acceptances") {
        throw new Error(`Unexpected select from ${tableName}`);
      }
      legalReads += 1;
      if (/organization_id"?\s+is\s+null/i.test(query.sql)) {
        return rows
          .filter((row) => row.organizationId == null && row.userId === "app-user")
          .map(selectedLegalRow);
      }
      const organizationId = query.params.find((value) => typeof value === "number");
      return rows
        .filter((row) => row.organizationId === organizationId)
        .map(selectedLegalRow);
    };
    const chain = {
      from(value) {
        table = value;
        return chain;
      },
      where(value) {
        condition = value;
        return chain;
      },
      limit(value) {
        return Promise.resolve(result().slice(0, value));
      },
      orderBy() {
        return Promise.resolve(result());
      },
    };
    return chain;
  },
};

Module._load = function (request, parent, isMain) {
  if (request === "@clerk/nextjs/server") {
    return {
      auth: async () => ({ userId: "clerk-user" }),
      currentUser: async () => null,
    };
  }
  if (request === "@/lib/db") return { db };
  if (request === "@/lib/venue-access") {
    return {
      requireOrganizationCapability: async (organizationId, capability) => {
        accessCalls.push({ organizationId, capability, accessMode });
        if (accessMode === "owner") {
          return { ok: true, organizationId, role: "owner" };
        }
        return { ok: false, status: 403, error: "Forbidden" };
      },
    };
  }
  return oldLoad.call(this, request, parent, isMain);
};

async function get(api, suffix = "") {
  return api.GET(new NextRequest(`https://example.invalid/api/legal/accept${suffix}`));
}

(async () => {
  try {
    const api = loadAfterMocks(path.join(root, "src/app/api/legal/accept/route.ts"));

    let response = await get(api, "?organizationId=1");
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items.map((item) => item.id), [101]);

    response = await get(api, "?organizationId=2");
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items.map((item) => item.id), [202]);
    assert.deepEqual(
      accessCalls.map((call) => [call.organizationId, call.capability]),
      [[1, "manage_legal"], [2, "manage_legal"]],
    );

    response = await get(api);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items.map((item) => item.id), [303]);

    const readsBeforeInvalid = legalReads;
    const callsBeforeInvalid = accessCalls.length;
    for (const raw of ["", "abc", "0", "1.5", "%201"]) {
      response = await get(api, `?organizationId=${raw}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, "INVALID_ORGANIZATION_ID");
    }
    assert.equal(legalReads, readsBeforeInvalid);
    assert.equal(accessCalls.length, callsBeforeInvalid);

    for (const denied of ["inactive", "deleted", "demoted"]) {
      accessMode = denied;
      const readsBeforeDenied = legalReads;
      response = await get(api, "?organizationId=1");
      assert.equal(response.status, 403);
      assert.equal(legalReads, readsBeforeDenied);
    }

    console.log("PASS legal acceptance GET isolates personal/organization scopes and enforces live access");
  } finally {
    Module._load = oldLoad;
    global.fetch = oldFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
