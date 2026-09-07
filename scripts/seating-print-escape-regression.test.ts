import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { escapeHtml } from "../src/lib/email/escape";
import { assignedHeadcount, guestHeadcount } from "../src/lib/planner/guest-headcount";

// Run the production export callback with a write-only popup stub. No browser,
// network, database, or execution of the resulting HTML is involved.
function renderPrint(name: string, translatedText: string) {
  const source = readFileSync("src/components/planner/seating-view.tsx", "utf8");
  const ast = ts.createSourceFile("seating-view.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "exportSeatingPDF") callback = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback);
  let html = "";
  const environment = {
    tables: [{ id: 10, name, seats: 7 }, { id: 11, name: "Empty & safe", seats: 2 }],
    guests: [{ id: 1, fullName: name, guestType: "family", partySize: 3, kidsCount: 1, plusOnes: 0 }],
    seats: [{ tableId: 10, guestId: 1 }],
    locale: "en", placedCount: 4, totalGuests: 4,
    t: (_key: string, values?: Record<string, unknown>) => `${translatedText}${values ? JSON.stringify(values) : ""}`,
    assignedHeadcount, guestHeadcount, escapeHtml,
    window: { open: () => ({ document: { write: (value: string) => { html = value; }, close: () => {} }, print: () => {} }) },
    setTimeout: () => 0,
  };
  const compiled = ts.transpileModule(callback, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function(...Object.keys(environment), `${compiled}; exportSeatingPDF();`)(...Object.values(environment));
  return html;
}

test("print export escapes stored guest/table markup and all translated text contexts", () => {
  const name = '<img src=x onerror="alert(1)"> Familia O\'Neill & <script>alert(2)</script>';
  const label = '</title><svg onload="alert(3)">';
  const html = renderPrint(name, label);
  assert.ok(html.includes(escapeHtml(name)));
  assert.ok(html.includes(escapeHtml(label)));
  assert.ok(html.includes("(+3)"));
  assert.doesNotMatch(html, /<(?:img|script|svg)\b/i);
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.equal((html.match(/<\/title>/g) ?? []).length, 1);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
});

test("print export retains ordinary multilingual names and printable structure", () => {
  const html = renderPrint("Familia Ștefan, Бельцы, Chișinău", "Locuri");
  assert.ok(html.includes("Familia Ștefan, Бельцы, Chișinău (+3)"));
  assert.ok(html.includes("Empty &amp; safe"));
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.endsWith("</body></html>"));
});
