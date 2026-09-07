import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { GuestImportError, parseGuestImportRows, GUEST_IMPORT_WORKBOOK_OPTIONS } from "../src/lib/planner/guest-import";
import { guestHeadcount } from "../src/lib/planner/guest-headcount";

const fixture = [
  { fullName: "QA Single", guestType: "single", partySize: 1, kidsCount: 0, plusOnes: 0, rsvp: "pending" },
  { fullName: "QA Couple", guestType: "couple", partySize: 2, kidsCount: 0, plusOnes: 0, rsvp: "accepted" },
  { fullName: "QA Family", guestType: "family", partySize: 3, kidsCount: 1, plusOnes: 0, rsvp: "maybe" },
  { fullName: "QA Legacy", guestType: "single", partySize: 1, kidsCount: 0, plusOnes: 2, rsvp: "declined" },
].map(guest => ({ ...guest, phone: "+12025550123", email: "fixture@invalid.epetrecere.md", group: "QA group", dietary: "QA dietary", notes: "QA notes" }));
const fieldKeys = {
  fullName: "exportName", guestType: "exportType", partySize: "exportAdults", kidsCount: "exportChildren",
  plusOnes: "exportPlusOnes", phone: "exportPhone", email: "exportEmail", group: "exportGroup",
  rsvp: "exportRsvp", dietary: "exportDietary", notes: "exportNotes",
} as const;

for (const locale of ["ro", "ru", "en"]) {
  test(`${locale} exported workbook round-trips all fields, household counts and RSVP in memory`, () => {
    const labels = JSON.parse(readFileSync(`src/i18n/${locale}.json`, "utf8")).cabinet.guests;
    const rows = fixture.map(guest => Object.fromEntries(Object.entries(fieldKeys).map(([field, label]) => [labels[label], guest[field as keyof typeof guest]])));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Invitati");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const decoded = XLSX.read(bytes, { type: "buffer" });
    const parsed = parseGuestImportRows(XLSX.utils.sheet_to_json(decoded.Sheets[decoded.SheetNames[0]]));
    assert.deepEqual(parsed, fixture);
    assert.deepEqual(parsed.map(guestHeadcount), [1, 2, 4, 3]);
    assert.deepEqual(parsed.map(guest => guest.rsvp), ["pending", "accepted", "maybe", "declined"]);
  });
}

test("legacy name-only CSV, aliases, BOM and unaccented headers keep working", () => {
  const csv = '\ufeffFull Name,Phone\nQA Test,+12025550123\n';
  const workbook = XLSX.read(csv, { type: "string", raw: true });
  const [guest] = parseGuestImportRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
  assert.equal(guest.fullName, "QA Test");
  assert.equal(guest.guestType, "single");
  assert.equal(guest.partySize, 1);
  assert.equal(guest.kidsCount, 0);
  assert.equal(guest.rsvp, "pending");
  assert.equal(guest.phone, "+12025550123");
  assert.equal(parseGuestImportRows([{ Nume: "QA", Adulti: "3", Copii: "2" }])[0].guestType, "family");
  assert.equal(parseGuestImportRows([{ "  nUmE  ": "QA", "plus_ones": 2 }]).map(guestHeadcount)[0], 3);
  assert.deepEqual(parseGuestImportRows([{}, { Name: " " }]), []);
});

test("actual UI byte-reader options preserve CSV phone leading zeros and plus signs", () => {
  const bytes = new TextEncoder().encode("Name,Phone\nQA Local,069123456\nQA International,+37369123456\n");
  const workbook = XLSX.read(bytes.buffer, GUEST_IMPORT_WORKBOOK_OPTIONS);
  const parsed = parseGuestImportRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
  assert.deepEqual(parsed.map(guest => guest.phone), ["069123456", "+37369123456"]);
  assert.deepEqual(GUEST_IMPORT_WORKBOOK_OPTIONS, { type: "array", raw: true });
  const component = readFileSync("src/components/planner/guests-view.tsx", "utf8");
  const importer = component.slice(component.indexOf("async function importFromFile"), component.indexOf("function exportToFile"));
  assert.match(importer, /const data = await file\.arrayBuffer\(\)/);
  assert.match(importer, /XLSX\.read\(data, GUEST_IMPORT_WORKBOOK_OPTIONS\)/);
  assert.doesNotMatch(importer, /XLSX\.read\(data, \{/);
});

test("localized party and RSVP labels map to the server enums", () => {
  assert.equal(parseGuestImportRows([{ Nume: "QA", Tip: "Cuplu", RSVP: "Confirmat" }])[0].rsvp, "accepted");
  assert.equal(parseGuestImportRows([{ Имя: "QA", Тип: "Семья", Взрослые: 3, RSVP: "Возможно" }])[0].guestType, "family");
  assert.equal(parseGuestImportRows([{ Name: "QA", Type: "Single person", RSVP: "Declined" }])[0].rsvp, "declined");
});

test("rejects invalid numbers, incompatible party size, unknown enums and prototype names without coercion", () => {
  for (const extra of [
    { Adults: 0 }, { Adults: 9 }, { Adults: 2.5 }, { Adults: "2 people" }, { Adults: -1 },
    { Children: -1 }, { Children: 21 }, { Children: "1.5" }, { Children: Infinity },
    { "Plus ones": 21 }, { Type: "couple", Adults: 3 }, { Type: "single", Adults: 2 },
    { Type: "family", Adults: 1 }, { Type: "unknown" }, { RSVP: "paid" },
    { Type: "constructor" }, { RSVP: "constructor" },
  ]) assert.throws(() => parseGuestImportRows([{ Name: "QA", ...extra }]), GuestImportError);
  assert.throws(() => parseGuestImportRows([{ Name: "x".repeat(121) }]), GuestImportError);
  assert.throws(() => parseGuestImportRows([{ Phone: "QA TEST" }]), GuestImportError);
});

test("the whole file validates before any save, and errors contain no personal row values", () => {
  const saved: unknown[] = [];
  assert.throws(() => {
    const parsed = parseGuestImportRows([{ Name: "QA first" }, { Name: "PRIVATE NAME", Adults: "PRIVATE VALUE" }]);
    parsed.forEach(guest => saved.push(guest));
  }, (error: unknown) => error instanceof GuestImportError && error.row === 3 && !error.message.includes("PRIVATE"));
  assert.deepEqual(saved, []);
  const literal = parseGuestImportRows([{ Name: "<script>not executed</script>", Notes: "=SUM(1,2)" }])[0];
  assert.equal(literal.fullName, "<script>not executed</script>");
  assert.equal(literal.notes, "=SUM(1,2)");
});

test("component imports only through owner-scoped API; dietary and notes are encrypted on creation", () => {
  const component = readFileSync("src/components/planner/guests-view.tsx", "utf8");
  const importer = component.slice(component.indexOf("async function importFromFile"), component.indexOf("function exportToFile"));
  assert.ok(importer.indexOf("parseGuestImportRows(rows)") < importer.indexOf("await fetch("));
  assert.match(importer, /body: JSON\.stringify\(guest\)/);
  assert.match(importer, /importPartial/);
  assert.doesNotMatch(importer, /console\.|\/send|\/invitations/);
  assert.match(component, /exportPlusOnes.*guest\.plusOnes/);
  const api = readFileSync("src/app/api/event-plans/[id]/guests/route.ts", "utf8");
  assert.ok(api.indexOf("requirePlanOwnership(planId)") < api.indexOf(".insert(guestList)"));
  assert.match(api, /\.values\(protectGuestListRecord\(/);
  assert.match(api, /dietary: parsed\.data\.dietary/);
  assert.match(api, /rsvp: z\.enum\(\["pending", "accepted", "declined", "maybe"\]\)/);
  const privacy = readFileSync("src/lib/privacy/guest-encryption.ts", "utf8");
  assert.match(privacy, /"dietary", "notes"/);
});
