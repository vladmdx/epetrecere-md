import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizePath } from "../src/lib/i18n/routing";

const listPage = readFileSync("src/app/[locale]/(admin)/admin/sali/page.tsx", "utf8");
const detailPage = readFileSync("src/app/[locale]/(admin)/admin/sali/[id]/page.tsx", "utf8");
const registrationPage = readFileSync("src/app/[locale]/(admin)/admin/cereri-inregistrare/page.tsx", "utf8");
const contractsPage = readFileSync("src/app/[locale]/(admin)/admin/contracte/page.tsx", "utf8");
const listRoute = readFileSync("src/app/api/admin/venues/route.ts", "utf8");
const detailRoute = readFileSync("src/app/api/admin/venues/[id]/route.ts", "utf8");
const registrationRoute = readFileSync("src/app/api/admin/registration-requests/route.ts", "utf8");
const ro = readFileSync("src/i18n/ro.json", "utf8");
const ru = readFileSync("src/i18n/ru.json", "utf8");
const en = readFileSync("src/i18n/en.json", "utf8");

test("admin venue list consumes the dedicated admin API items envelope", () => {
  assert.match(listPage, /fetch\(`\/api\/admin\/venues\?\$\{params\.toString\(\)\}`\)/);
  assert.match(listPage, /Array\.isArray\(data\.items\) \? data\.items : \[\]/);
  assert.doesNotMatch(listPage, /\/api\/venues\?limit=200/);
  assert.doesNotMatch(listPage, /from "next\/link"/);
  assert.match(listPage, /from "@\/components\/shared\/locale-link"/);
  assert.match(listPage, /htmlFor="admin-venue-search"/);
  assert.match(listPage, /htmlFor="admin-venue-status"/);
  assert.match(listPage, /aria-label=\{t\("adminUi\.venues\.previousPage"\)\}/);
  assert.match(listPage, /aria-label=\{t\("adminUi\.venues\.nextPage"\)\}/);
});

test("admin venue detail reads the admin endpoint and keeps PUT\/DELETE on \/api\/venues", () => {
  assert.match(detailPage, /fetch\(`\/api\/admin\/venues\/\$\{id\}`\)/);
  assert.match(detailPage, /method: "PUT"/);
  assert.match(detailPage, /fetch\(`\/api\/venues\/\$\{venue\.id\}`/);
  assert.match(detailPage, /method: "DELETE"/);
  assert.match(detailPage, /adminUi\.venues\.companyHolder/);
  assert.match(detailPage, /adminUi\.venues\.hallsSection/);
  assert.doesNotMatch(detailPage, /from "next\/link"/);
});

test("registration GET adds org\/halls without changing POST approval", () => {
  const postStart = registrationRoute.indexOf("export async function POST");
  assert.ok(postStart > 0);
  const getFnStart = registrationRoute.indexOf("export async function GET");
  const getPart = registrationRoute.slice(getFnStart, postStart);
  const postPart = registrationRoute.slice(postStart);
  assert.match(getPart, /attachRegistrationVenueAudit/);
  assert.match(getPart, /organization: audit\.organization/);
  assert.match(getPart, /halls: audit\.halls/);
  assert.match(postPart, /approvePartnerVenue/);
  assert.match(postPart, /rejectPartnerVenue/);
  assert.doesNotMatch(getPart, /approvePartnerVenue\(/);
  assert.doesNotMatch(getPart, /rejectPartnerVenue\(/);
  assert.match(registrationPage, /adminUi\.registrations\.organization/);
  assert.match(registrationPage, /adminUi\.registrations\.halls/);
  assert.doesNotMatch(registrationPage, /const orgCopy =/);
});

test("admin contracts group by acceptanceSessionId and resolve org holders without venueByUser", () => {
  assert.match(contractsPage, /organizationId: legalAcceptances\.organizationId/);
  assert.match(contractsPage, /acceptanceSessionId: legalAcceptances\.acceptanceSessionId/);
  assert.match(contractsPage, /groupAdminContractSessions/);
  assert.match(contractsPage, /key=\{session\.sessionId\}/);
  assert.match(contractsPage, /\/api\/legal\/accept\/\$\{session\.pdfAnchorId\}\/pdf/);
  assert.doesNotMatch(contractsPage, /userId \?\? r\.email/);
  const holderBlock = contractsPage.slice(
    contractsPage.indexOf("const who = session.holder.name"),
    contractsPage.indexOf("const who = session.holder.name") + 400,
  );
  assert.doesNotMatch(holderBlock, /venueByUser/);
});

test("new admin endpoints are admin-only, no-store, and skip the public catalog predicate", () => {
  assert.match(listRoute, /requireAdmin/);
  assert.match(detailRoute, /requireAdmin/);
  assert.match(listRoute, /ADMIN_NO_STORE_HEADERS/);
  assert.match(detailRoute, /ADMIN_NO_STORE_HEADERS/);
  assert.doesNotMatch(listRoute, /publishedVenuePredicateSql/);
  assert.doesNotMatch(detailRoute, /publishedVenuePredicateSql/);
  assert.doesNotMatch(listRoute, /bankDetails/);
  assert.doesNotMatch(detailRoute, /bankDetails/);
  assert.doesNotMatch(listRoute, /select\(\*\)/);
});

test("new i18n keys exist in RO, RU and EN", () => {
  for (const source of [ro, ru, en]) {
    assert.match(source, /"companyHolder"/);
    assert.match(source, /"unpublishableHallsSummary"/);
    assert.match(source, /"searchLabel"/);
    assert.match(source, /"organizationId"/);
  }
});

for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: admin venue and registration links keep the language`, () => {
    for (const path of ["/admin/sali", "/admin/sali/12", "/admin/cereri-inregistrare", "/admin/contracte"]) {
      const localized = localizePath(path, locale);
      const expectedPrefix = locale === "ro" ? "" : `/${locale}`;
      assert.equal(localized, `${expectedPrefix}${path}`);
    }
  });
}
