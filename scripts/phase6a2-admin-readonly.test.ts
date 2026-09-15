import assert from "node:assert/strict";
import { test } from "node:test";
import { forbiddenAdminDtoKeys } from "../src/lib/admin/http";
import { parsePositiveIntId } from "../src/lib/admin/parse-positive-int";
import {
  adminMinHallPrice,
  aggregateAdminHalls,
  hallsBelongingToVenue,
  mapAdminVenueListItems,
  parseAdminVenueListQuery,
  ADMIN_VENUE_LIST_MAX_LIMIT,
  ADMIN_VENUE_LIST_MAX_OFFSET,
} from "../src/lib/admin/venue-list";
import { adminHallPriceText, adminKnownPriceText, adminVenueStatusText } from "../src/lib/admin/venue-display";
import {
  adminPublicHallHref,
  adminVenuePublicHref,
  mapAdminGeneralImages,
  mapAdminVenueHalls,
} from "../src/lib/admin/venue-detail";
import { attachRegistrationVenueAudit } from "../src/lib/admin/registration-queue";
import {
  groupAdminContractSessions,
  resolveAdminContractHolder,
  uniqueAdminContractSessionIds,
} from "../src/lib/admin/contract-sessions";

function withFlag(on: boolean, fn: () => void) {
  const previous = process.env.FEATURE_MULTI_HALL;
  if (on) process.env.FEATURE_MULTI_HALL = "1";
  else delete process.env.FEATURE_MULTI_HALL;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.FEATURE_MULTI_HALL;
    else process.env.FEATURE_MULTI_HALL = previous;
  }
}

test("parsePositiveIntId rejects NaN, fractions, zero and unsafe values", () => {
  assert.equal(parsePositiveIntId("12"), 12);
  assert.equal(parsePositiveIntId("0"), null);
  assert.equal(parsePositiveIntId("-1"), null);
  assert.equal(parsePositiveIntId("1.5"), null);
  assert.equal(parsePositiveIntId("01"), null);
  assert.equal(parsePositiveIntId("abc"), null);
  assert.equal(parsePositiveIntId("1e2"), null);
  assert.equal(parsePositiveIntId(String(Number.MAX_SAFE_INTEGER + 1)), null);
});

test("admin venue list query validates page, limit, search and status", () => {
  assert.deepEqual(parseAdminVenueListQuery(new URLSearchParams()), {
    ok: true,
    page: 1,
    limit: 20,
    q: null,
    status: null,
  });
  assert.equal(parseAdminVenueListQuery(new URLSearchParams("page=0")).ok, false);
  assert.equal(parseAdminVenueListQuery(new URLSearchParams("page=1.5")).ok, false);
  assert.equal(parseAdminVenueListQuery(new URLSearchParams(`page=${Number.MAX_SAFE_INTEGER}`)).ok, false);
  assert.equal(parseAdminVenueListQuery(new URLSearchParams(`page=${Math.floor(ADMIN_VENUE_LIST_MAX_OFFSET / 20) + 2}`)).ok, false);
  assert.equal(parseAdminVenueListQuery(new URLSearchParams(`limit=${ADMIN_VENUE_LIST_MAX_LIMIT + 1}`)).ok, false);
  assert.equal(parseAdminVenueListQuery(new URLSearchParams("status=nope")).ok, false);
  assert.equal(parseAdminVenueListQuery(new URLSearchParams("status=published")).ok, true);
  assert.equal(parseAdminVenueListQuery(new URLSearchParams("q=" + "x".repeat(121))).ok, false);
  const search = parseAdminVenueListQuery(new URLSearchParams("q=Chișinău&status=pending&page=2&limit=10"));
  assert.deepEqual(search, {
    ok: true,
    page: 2,
    limit: 10,
    q: "Chișinău",
    status: "pending",
  });
});

test("list mapping keeps venues without org or halls and does not duplicate org hall counts", () => {
  const items = mapAdminVenueListItems(
    [
      {
        id: 1,
        nameRo: "Legacy",
        nameRu: null,
        nameEn: null,
        slug: "legacy",
        city: "Bălți",
        isActive: false,
        isFeatured: false,
        ratingAvg: null,
        capacityMin: null,
        capacityMax: null,
        pricePerPerson: null,
        organizationId: null,
        orgId: null,
        orgDisplayName: null,
        orgLegalName: null,
        orgType: null,
        orgStatus: null,
      },
      {
        id: 2,
        nameRo: "Grand",
        nameRu: null,
        nameEn: null,
        slug: "grand",
        city: "Chișinău",
        isActive: true,
        isFeatured: true,
        ratingAvg: 4.5,
        capacityMin: 20,
        capacityMax: 100,
        pricePerPerson: 40,
        organizationId: 9,
        orgId: 9,
        orgDisplayName: "Acme",
        orgLegalName: "Acme SRL",
        orgType: "company",
        orgStatus: "pending",
      },
      {
        id: 3,
        nameRo: "Garden",
        nameRu: null,
        nameEn: null,
        slug: "garden",
        city: "Chișinău",
        isActive: false,
        isFeatured: false,
        ratingAvg: null,
        capacityMin: null,
        capacityMax: null,
        pricePerPerson: null,
        organizationId: 9,
        orgId: 9,
        orgDisplayName: "Acme",
        orgLegalName: "Acme SRL",
        orgType: "company",
        orgStatus: "pending",
      },
    ],
    [
      {
        id: 21,
        venueId: 2,
        status: "active",
        capacityMin: 10,
        capacityMax: 80,
        pricingModel: "per_person",
        basePrice: 30,
        minimumOrder: null,
        currency: "EUR",
      },
      {
        id: 22,
        venueId: 2,
        status: "draft",
        capacityMin: null,
        capacityMax: 120,
        pricingModel: "per_person",
        basePrice: 25,
        minimumOrder: null,
        currency: "EUR",
      },
      {
        id: 31,
        venueId: 3,
        status: "rejected",
        capacityMin: null,
        capacityMax: 40,
        pricingModel: "quote",
        basePrice: null,
        minimumOrder: null,
        currency: "EUR",
      },
    ],
  );

  assert.equal(items.length, 3);
  assert.equal(items[0]!.organization, null);
  assert.equal(items[0]!.halls.total, 0);
  assert.equal(items[1]!.organization?.id, 9);
  assert.equal(items[2]!.organization?.id, 9);
  assert.equal(items[1]!.halls.total, 2);
  assert.equal(items[2]!.halls.total, 1);
  assert.equal(items[1]!.halls.byStatus.active, 1);
  assert.equal(items[1]!.halls.byStatus.draft, 1);
  assert.deepEqual(items[1]!.halls.minPrice, { amount: 30, currency: "EUR", model: "per_person" });
  assert.equal(items[2]!.halls.minPrice, null);
  assert.equal(forbiddenAdminDtoKeys(items).length, 0);
});

test("min hall price is omitted for quote, missing amounts and mixed models", () => {
  assert.equal(adminMinHallPrice([{ pricingModel: "quote", basePrice: 10, minimumOrder: null, currency: "EUR" }]), null);
  assert.equal(adminMinHallPrice([{ pricingModel: "fixed", basePrice: null, minimumOrder: null, currency: "EUR" }]), null);
  assert.equal(
    adminMinHallPrice([
      { pricingModel: "per_person", basePrice: 10, minimumOrder: null, currency: "EUR" },
      { pricingModel: "fixed", basePrice: 200, minimumOrder: null, currency: "EUR" },
    ]),
    null,
  );
  assert.deepEqual(
    adminMinHallPrice([
      { pricingModel: "fixed", basePrice: 80, minimumOrder: null, currency: "EUR" },
      { pricingModel: "fixed", basePrice: 50, minimumOrder: null, currency: "EUR" },
    ]),
    { amount: 50, currency: "EUR", model: "fixed" },
  );
});

test("admin prices keep currency and model, including minimum order and quote", () => {
  const t = (key: string) => ({
    "adminUi.venues.pricePerPersonModel": "per person",
    "adminUi.venues.priceFixedModel": "fixed",
    "adminUi.venues.priceMinimumOrderModel": "minimum order",
    "adminUi.venues.priceQuoteModel": "on request",
    "adminUi.venues.priceUnknown": "not specified",
    "adminUi.venues.statusPending": "pending",
  } as Record<string, string>)[key] ?? key;
  assert.equal(adminHallPriceText({ pricingModel: "minimum_order", basePrice: null, minimumOrder: 900, currency: "MDL" }, t), "900 MDL · minimum order");
  assert.equal(adminHallPriceText({ pricingModel: "quote", basePrice: null, minimumOrder: null, currency: "EUR" }, t), "on request");
  assert.equal(adminKnownPriceText({ amount: 20, currency: "USD", model: "per_person" }, t), "20 USD · per person");
  assert.equal(adminVenueStatusText("new-status", t), "new-status");
});

test("halls from another venue cannot appear in the current venue projection", () => {
  const halls = mapAdminVenueHalls({
    venueId: 1,
    venueSlug: "one",
    venueIsActive: true,
    organizationId: null,
    organizationStatus: "active",
    halls: [
      {
        id: 10,
        venueId: 1,
        nameRo: "Mine",
        nameRu: null,
        nameEn: null,
        slug: "mine",
        status: "active",
        isLegacyDefault: true,
        capacityMin: 10,
        capacityMax: 20,
        pricingModel: "per_person",
        basePrice: 15,
        minimumOrder: null,
        currency: "EUR",
        depositType: "none",
        depositValue: null,
        sortOrder: 2,
        updatedAt: new Date("2026-09-15T00:00:00Z"),
      },
      {
        id: 11,
        venueId: 2,
        nameRo: "Other",
        nameRu: null,
        nameEn: null,
        slug: "other",
        status: "active",
        isLegacyDefault: false,
        capacityMin: 1,
        capacityMax: 2,
        pricingModel: "fixed",
        basePrice: 9,
        minimumOrder: null,
        currency: "EUR",
        depositType: "none",
        depositValue: null,
        sortOrder: 0,
        updatedAt: new Date("2026-09-15T00:00:00Z"),
      },
    ],
    photoCountByHallId: new Map([[10, 3], [11, 9]]),
  });
  assert.deepEqual(halls.map((hall) => hall.id), [10]);
  assert.equal(halls[0]!.photoCount, 3);
  assert.deepEqual(hallsBelongingToVenue(1, [{ venueId: 1, id: 10 }, { venueId: 2, id: 11 }]).map((h) => h.id), [10]);
  assert.deepEqual(
    mapAdminGeneralImages(1, [
      { id: 1, venueId: 1, hallId: null, url: "/a.jpg", altRo: null, altRu: null, altEn: null, sortOrder: 1, isCover: true },
      { id: 2, venueId: 1, hallId: 10, url: "/hall.jpg", altRo: null, altRu: null, altEn: null, sortOrder: 0, isCover: false },
      { id: 3, venueId: 2, hallId: null, url: "/other.jpg", altRo: null, altRu: null, altEn: null, sortOrder: 0, isCover: true },
    ]).map((image) => image.id),
    [1],
  );
});

test("public hall href stays on the existing public route and respects the feature flag", () => {
  withFlag(false, () => {
    assert.equal(adminVenuePublicHref({ venueSlug: "grand", venueIsActive: true, organizationId: 1, organizationStatus: "pending", activeHallCount: 0 }), "/sali/grand");
    assert.equal(
      adminPublicHallHref({
        venueSlug: "grand",
        hallSlug: "ballroom",
        hallStatus: "active",
        venueIsActive: true,
        organizationId: 1,
        organizationStatus: "pending",
      }),
      null,
    );
  });
  withFlag(true, () => {
    assert.equal(adminVenuePublicHref({ venueSlug: "grand", venueIsActive: true, organizationId: 1, organizationStatus: "pending", activeHallCount: 1 }), null);
    assert.equal(adminVenuePublicHref({ venueSlug: "grand", venueIsActive: true, organizationId: 1, organizationStatus: "active", activeHallCount: 0 }), null);
    assert.equal(adminVenuePublicHref({ venueSlug: "grand", venueIsActive: true, organizationId: 1, organizationStatus: "active", activeHallCount: 1 }), "/sali/grand");
    assert.equal(
      adminPublicHallHref({
        venueSlug: "grand",
        hallSlug: "ballroom",
        hallStatus: "active",
        venueIsActive: true,
        organizationId: 1,
        organizationStatus: "pending",
      }),
      null,
    );
    assert.equal(
      adminPublicHallHref({
        venueSlug: "grand",
        hallSlug: "ballroom",
        hallStatus: "draft",
        venueIsActive: true,
        organizationId: 1,
        organizationStatus: "active",
      }),
      null,
    );
    assert.equal(
      adminPublicHallHref({
        venueSlug: "grand",
        hallSlug: "ballroom",
        hallStatus: "active",
        venueIsActive: true,
        organizationId: 1,
        organizationStatus: null,
      }),
      null,
    );
    assert.equal(
      adminPublicHallHref({
        venueSlug: "grand",
        hallSlug: "ballroom",
        hallStatus: "active",
        venueIsActive: true,
        organizationId: 1,
        organizationStatus: "active",
      }),
      "/sali/grand?hall=ballroom",
    );
  });
});

test("registration queue attaches org and halls for the current venue only", () => {
  const result = attachRegistrationVenueAudit({
    venueId: 5,
    organizationId: 9,
    organizationsById: new Map([
      [9, { id: 9, displayName: "Acme", legalName: "Acme SRL", type: "company", status: "pending" }],
    ]),
    halls: [
      {
        id: 1,
        venueId: 5,
        nameRo: "A",
        nameRu: null,
        nameEn: null,
        slug: "a",
        status: "draft",
        isLegacyDefault: true,
        capacityMin: null,
        capacityMax: null,
        pricingModel: "quote",
        basePrice: null,
        minimumOrder: null,
        currency: "EUR",
        sortOrder: 1,
      },
      {
        id: 2,
        venueId: 99,
        nameRo: "Leak",
        nameRu: null,
        nameEn: null,
        slug: "leak",
        status: "active",
        isLegacyDefault: false,
        capacityMin: 10,
        capacityMax: 20,
        pricingModel: "fixed",
        basePrice: 1,
        minimumOrder: null,
        currency: "EUR",
        sortOrder: 0,
      },
    ],
    photoCountByHallId: new Map([[1, 2], [2, 8]]),
  });
  assert.equal(result.organization?.legalName, "Acme SRL");
  assert.deepEqual(result.halls.map((hall) => hall.id), [1]);
  assert.equal(result.halls[0]!.photoCount, 2);
  assert.equal(result.summaries.noHalls, false);
  assert.equal(result.summaries.allUnpublishable, true);
  const empty = attachRegistrationVenueAudit({
    venueId: 6,
    organizationId: null,
    organizationsById: new Map(),
    halls: [],
    photoCountByHallId: new Map(),
  });
  assert.equal(empty.organization, null);
  assert.equal(empty.summaries.noHalls, true);
});

test("contracts of two orgs signed by the same user stay isolated by session", () => {
  const maps = {
    orgById: new Map([
      [1, { id: 1, displayName: "One", legalName: "One SRL", type: "company", status: "active" }],
      [2, { id: 2, displayName: "Two", legalName: "Two SRL", type: "company", status: "active" }],
    ]),
    artistById: new Map<number, string>(),
    venueById: new Map<number, string>(),
    artistByUser: new Map<string, string>(),
    venueByUser: new Map([["user-1", "Wrong venue from user map"]]),
  };
  const rows = [
    doc(10, { organizationId: 1, acceptanceSessionId: "s1", documentSlug: "politica-confidentialitate", userId: "user-1" }),
    doc(11, { organizationId: 1, acceptanceSessionId: "s1", documentSlug: "acord-parteneri", userId: "user-1" }),
    doc(20, { organizationId: 2, acceptanceSessionId: "s2", documentSlug: "acord-parteneri", userId: "user-1" }),
    doc(21, { organizationId: 1, acceptanceSessionId: "s3", documentSlug: "acord-parteneri", userId: "user-1" }),
  ];
  const sessions = groupAdminContractSessions(rows, maps);
  assert.deepEqual(sessions.map((session) => session.sessionId).sort(), ["s1", "s2", "s3"]);
  const first = sessions.find((session) => session.sessionId === "s1")!;
  assert.equal(first.holder.name, "One SRL");
  assert.equal(first.holder.organizationId, 1);
  assert.deepEqual(first.documents.map((row) => row.id), [11, 10]);
  assert.equal(first.pdfAnchorId, 11);
  assert.equal(first.documents.length, 2);
  assert.equal(sessions.find((session) => session.sessionId === "s2")!.holder.organizationId, 2);
  assert.equal(sessions.find((session) => session.sessionId === "s3")!.holder.organizationId, 1);
  assert.equal(
    resolveAdminContractHolder(rows[0]!, maps).name,
    "One SRL",
  );
  assert.notEqual(resolveAdminContractHolder(rows[0]!, maps).name, "Wrong venue from user map");
});

test("recent-row boundary expands to complete session IDs", () => {
  const recent = [
    { acceptanceSessionId: "s1" },
    { acceptanceSessionId: "s1" },
    { acceptanceSessionId: "s2" },
  ];
  assert.deepEqual(uniqueAdminContractSessionIds(recent), ["s1", "s2"]);
  const all = [
    doc(1, { acceptanceSessionId: "s1" }),
    doc(2, { acceptanceSessionId: "s1" }),
    doc(3, { acceptanceSessionId: "s1" }),
    doc(4, { acceptanceSessionId: "s2" }),
  ];
  const expanded = all.filter((row) => uniqueAdminContractSessionIds(recent).includes(row.acceptanceSessionId));
  assert.equal(expanded.length, 4);
});

test("legacy personal acceptances still resolve by user when organizationId is null", () => {
  const holder = resolveAdminContractHolder(
    doc(3, { organizationId: null, acceptanceSessionId: "legacy", userId: "user-1", subjectType: "venue" }),
    {
      orgById: new Map(),
      artistById: new Map(),
      venueById: new Map(),
      artistByUser: new Map(),
      venueByUser: new Map([["user-1", "Sala veche"]]),
    },
  );
  assert.equal(holder.kind, "venue");
  assert.equal(holder.name, "Sala veche");
});

test("admin DTOs reject bankDetails keys", () => {
  assert.deepEqual(forbiddenAdminDtoKeys({ organization: { id: 1, bankDetails: { iban: "x" } } }), [
    "$.organization.bankDetails",
  ]);
  assert.equal(forbiddenAdminDtoKeys({ organization: { id: 1, displayName: "A" } }).length, 0);
  assert.equal(aggregateAdminHalls([]).total, 0);
});

function doc(
  id: number,
  overrides: Partial<{
    organizationId: number | null;
    acceptanceSessionId: string;
    documentSlug: string;
    userId: string | null;
    subjectType: string;
  }>,
) {
  return {
    id,
    userId: overrides.userId ?? "user-1",
    organizationId: overrides.organizationId ?? null,
    acceptanceSessionId: overrides.acceptanceSessionId ?? "s",
    artistId: null,
    venueId: null,
    subjectType: overrides.subjectType ?? "venue",
    documentSlug: overrides.documentSlug ?? "acord-parteneri",
    documentBlocks: [{ type: "p", text: "ok" }],
    acceptedAt: new Date("2026-09-15T00:00:00Z"),
    userName: "Signer",
    userEmail: "a@example.invalid",
    email: "a@example.invalid",
  };
}
