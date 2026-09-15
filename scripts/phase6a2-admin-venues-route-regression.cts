/** Request-level GET /api/admin/venues regression with in-memory auth and DB. */
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

let adminGate = { ok: true, userId: "admin-1", role: "admin" };

const venues = [
  venueRow(1, { nameRo: "Alpha", isActive: true, organizationId: 9, city: "Chișinău" }),
  venueRow(2, { nameRo: "Beta", isActive: false, organizationId: 9, city: "Bălți" }),
  venueRow(3, { nameRo: "Gamma", isActive: false, organizationId: null, city: "Orhei" }),
];
const orgs = [
  { id: 9, displayName: "Acme", legalName: "Acme SRL", type: "company", status: "pending" },
];
const halls = [
  hallRow(11, 1, { status: "active", sortOrder: 1, nameRo: "Ballroom" }),
  hallRow(12, 1, { status: "draft", sortOrder: 2, nameRo: "Garden" }),
  hallRow(21, 2, { status: "rejected", sortOrder: 0, nameRo: "Other venue hall" }),
];
const images = [
  { id: 100, venueId: 1, hallId: null, url: "/general.jpg", altRo: null, altRu: null, altEn: null, sortOrder: 0, isCover: true },
  { id: 101, venueId: 1, hallId: 11, url: "/hall.jpg", altRo: null, altRu: null, altEn: null, sortOrder: 0, isCover: false },
  { id: 102, venueId: 2, hallId: 21, url: "/other.jpg", altRo: null, altRu: null, altEn: null, sortOrder: 0, isCover: false },
];

function venueRow(id, overrides) {
  return {
    id,
    nameRo: overrides.nameRo,
    nameRu: null,
    nameEn: null,
    slug: overrides.nameRo.toLowerCase(),
    city: overrides.city,
    isActive: overrides.isActive,
    isFeatured: false,
    ratingAvg: null,
    ratingCount: 0,
    capacityMin: null,
    capacityMax: null,
    pricePerPerson: null,
    organizationId: overrides.organizationId,
    descriptionRo: null,
    descriptionRu: null,
    descriptionEn: null,
    address: null,
    phone: null,
    email: null,
    website: null,
    menuUrl: null,
    menuPdfUrl: null,
    virtualTourUrl: null,
    seoTitleRo: null,
    seoTitleRu: null,
    seoTitleEn: null,
    seoDescRo: null,
    seoDescRu: null,
    seoDescEn: null,
  };
}

function hallRow(id, venueId, overrides) {
  return {
    id,
    venueId,
    nameRo: overrides.nameRo,
    nameRu: null,
    nameEn: null,
    slug: overrides.nameRo.toLowerCase(),
    status: overrides.status,
    isLegacyDefault: false,
    capacityMin: 10,
    capacityMax: 40,
    pricingModel: "per_person",
    basePrice: 20,
    minimumOrder: null,
    currency: "EUR",
    depositType: "none",
    depositValue: null,
    sortOrder: overrides.sortOrder,
    updatedAt: new Date("2026-09-15T00:00:00Z"),
  };
}

function queryOf(condition) {
  if (!condition) return { sql: "", params: [] };
  return dialect.sqlToQuery(condition);
}

function applyVenueFilters(rows, condition) {
  const { sql, params } = queryOf(condition);
  let next = rows.slice();
  if (/is_active/i.test(sql) && params.includes(true)) next = next.filter((row) => row.isActive);
  if (/is_active/i.test(sql) && params.includes(false)) next = next.filter((row) => !row.isActive);
  if (/partner_organizations"?\."?status/i.test(sql) || (/status/i.test(sql) && params.includes("pending"))) {
    next = next.filter((row) => orgs.find((org) => org.id === row.organizationId)?.status === "pending");
  }
  const like = params.find((value) => typeof value === "string" && value.includes("%"));
  if (like) {
    const q = String(like).replace(/%/g, "").toLowerCase();
    next = next.filter((row) =>
      [row.nameRo, row.nameRu, row.nameEn, row.city].some((value) => value && value.toLowerCase().includes(q)),
    );
  }
  const id = params.find((value) => typeof value === "number");
  if (/venues"?\."?id/i.test(sql) && typeof id === "number" && !/in\s*\(/i.test(sql)) {
    next = next.filter((row) => row.id === id);
  }
  return next.sort((a, b) => a.nameRo.localeCompare(b.nameRo) || a.id - b.id);
}

function numericParams(condition) {
  return queryOf(condition).params.filter((value) => typeof value === "number");
}

function chain(run) {
  const state = {};
  const c = {
    from(table) {
      state.table = table;
      return c;
    },
    leftJoin() {
      return c;
    },
    innerJoin() {
      return c;
    },
    where(value) {
      state.where = value;
      return c;
    },
    orderBy() {
      return c;
    },
    groupBy() {
      return c;
    },
    limit(value) {
      state.limit = value;
      return c;
    },
    offset(value) {
      state.offset = value;
      return c;
    },
    then(resolve, reject) {
      return Promise.resolve(run(state)).then(resolve, reject);
    },
  };
  return c;
}

function hasBank(value) {
  const json = JSON.stringify(value);
  return json.includes("bankDetails") || json.includes("bank_details");
}

const db = {
  select(projection) {
    const keys = projection ? Object.keys(projection) : [];
    return chain((state) => {
      const tableName = getTableName(state.table);
      if (tableName === "venues" && keys.length === 1 && keys[0] === "value") {
        return [{ value: applyVenueFilters(venues, state.where).length }];
      }
      if (tableName === "venues") {
        const rows = applyVenueFilters(venues, state.where);
        const offset = state.offset ?? 0;
        const limit = state.limit ?? rows.length;
        const page = rows.slice(offset, offset + limit);
        if (keys.includes("orgId") || keys.includes("orgDisplayName")) {
          return page.map((row) => {
            const org = orgs.find((item) => item.id === row.organizationId);
            return {
              ...row,
              orgId: org?.id ?? null,
              orgDisplayName: org?.displayName ?? null,
              orgLegalName: org?.legalName ?? null,
              orgType: org?.type ?? null,
              orgStatus: org?.status ?? null,
            };
          });
        }
        return page;
      }
      if (tableName === "partner_organizations") {
        const ids = numericParams(state.where);
        return ids.length ? orgs.filter((org) => ids.includes(org.id)) : orgs;
      }
      if (tableName === "venue_halls") {
        const ids = numericParams(state.where);
        if (!ids.length) return halls.slice();
        return halls.filter((hall) => ids.includes(hall.venueId) || ids.includes(hall.id));
      }
      if (tableName === "venue_images") {
        const ids = numericParams(state.where);
        if (keys.includes("photoCount")) {
          const counts = new Map();
          for (const image of images) {
            if (image.hallId == null) continue;
            if (ids.length && !ids.includes(image.hallId)) continue;
            counts.set(image.hallId, (counts.get(image.hallId) ?? 0) + 1);
          }
          return [...counts.entries()].map(([hallId, photoCount]) => ({ hallId, photoCount }));
        }
        return images.filter((image) => {
          if (ids.length && !ids.includes(image.venueId)) return false;
          return image.hallId == null;
        });
      }
      throw new Error(`Unexpected select from ${tableName}`);
    });
  },
};

Module._load = function (request, parent, isMain) {
  if (request === "@/lib/auth/admin") {
    return { requireAdmin: async () => adminGate };
  }
  if (request === "@/lib/db") return { db };
  return oldLoad.call(this, request, parent, isMain);
};

function listReq(suffix = "") {
  return new NextRequest(`https://example.invalid/api/admin/venues${suffix}`);
}

(async () => {
  try {
    const listApi = loadAfterMocks(path.join(root, "src/app/api/admin/venues/route.ts"));
    const detailApi = loadAfterMocks(path.join(root, "src/app/api/admin/venues/[id]/route.ts"));

    adminGate = { ok: false, status: 401, error: "Unauthorized" };
    let response = await listApi.GET(listReq());
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");

    adminGate = { ok: false, status: 403, error: "Admin only" };
    response = await listApi.GET(listReq());
    assert.equal(response.status, 403);
    response = await detailApi.GET(listReq("/1"), { params: Promise.resolve({ id: "1" }) });
    assert.equal(response.status, 403);

    adminGate = { ok: true, userId: "admin-1", role: "admin" };
    response = await listApi.GET(listReq("?page=0"));
    assert.equal(response.status, 400);
    response = await listApi.GET(listReq("?status=nope"));
    assert.equal(response.status, 400);
    response = await listApi.GET(listReq("?limit=200"));
    assert.equal(response.status, 400);

    response = await listApi.GET(listReq("?page=1&limit=20"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ["items", "limit", "page", "total"]);
    assert.equal(body.total, 3);
    assert.equal(body.page, 1);
    assert.equal(body.limit, 20);
    assert.equal(body.items.length, 3);
    assert.deepEqual(body.items.map((item) => item.nameRo), ["Alpha", "Beta", "Gamma"]);
    assert.equal(body.items[0].organization.id, 9);
    assert.equal(body.items[1].organization.id, 9);
    assert.equal(body.items[2].organization, null);
    assert.equal(body.items[2].halls.total, 0);
    assert.equal(body.items[0].halls.total, 2);
    assert.equal(body.items[1].halls.total, 1);
    assert.equal(hasBank(body), false);

    response = await listApi.GET(listReq("?page=1&limit=1"));
    const page1 = await response.json();
    assert.equal(page1.items.length, 1);
    assert.equal(page1.total, 3);
    assert.equal(page1.items[0].nameRo, "Alpha");
    response = await listApi.GET(listReq("?page=2&limit=1"));
    const page2 = await response.json();
    assert.equal(page2.items[0].nameRo, "Beta");

    response = await listApi.GET(listReq("?q=Orhei"));
    const searched = await response.json();
    assert.deepEqual(searched.items.map((item) => item.nameRo), ["Gamma"]);

    response = await detailApi.GET(listReq("/abc"), { params: Promise.resolve({ id: "abc" }) });
    assert.equal(response.status, 400);
    response = await detailApi.GET(listReq("/0"), { params: Promise.resolve({ id: "0" }) });
    assert.equal(response.status, 400);
    response = await detailApi.GET(listReq("/99"), { params: Promise.resolve({ id: "99" }) });
    assert.equal(response.status, 404);

    response = await detailApi.GET(listReq("/1"), { params: Promise.resolve({ id: "1" }) });
    assert.equal(response.status, 200);
    const detail = await response.json();
    assert.equal(detail.id, 1);
    assert.equal(detail.organization.legalName, "Acme SRL");
    assert.deepEqual(detail.halls.map((hall) => hall.id), [11, 12]);
    assert.ok(detail.halls.every((hall) => hall.id !== 21));
    assert.deepEqual(detail.images.map((image) => image.id), [100]);
    assert.equal(hasBank(detail), false);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");

    console.log("phase6a2 admin venues route regression ok");
  } finally {
    Module._load = oldLoad;
    global.fetch = oldFetch;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
