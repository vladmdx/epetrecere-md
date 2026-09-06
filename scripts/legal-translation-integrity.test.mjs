/** Exercises the actual legacy translator without a browser, API or DB. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const module = { exports: {} };
const source = `${read("src/i18n/legacy-dom-translator.ts")}\nexport const harness = { applyText, applyAttribute, applyElement, maps };`;
const compiled = transformSync(source, { loader: "ts", format: "cjs", target: "es2022" }).code;
runInNewContext(compiled, {
  module, exports: module.exports,
  require: name => {
    if (name === "react") return { useEffect() {} };
    if (name === "@/lib/moldova-cities") return { localizeMoldovaCity: value => value };
    throw new Error(`Unexpected import: ${name}`);
  },
  Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
});
const { applyText, applyAttribute, applyElement, maps } = module.exports.harness;
maps.en = JSON.parse(read("src/i18n/ui-phrases.en.json"));
maps.ru = JSON.parse(read("src/i18n/ui-phrases.ru.json"));

class ElementFixture {
  nodeType = 1;
  tagName = "DIV";
  childNodes = [];
  parentElement = null;
  attributes = new Map();
  constructor(attrs = {}, parent = null) {
    this.attributes = new Map(Object.entries(attrs));
    this.parentElement = parent;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector.includes("[data-no-auto-translate]") && node.attributes.has("data-no-auto-translate")) return node;
      if (selector.includes("[translate='no']") && node.getAttribute("translate") === "no") return node;
      if (selector.includes(".notranslate") && (node.getAttribute("class") ?? "").split(/\s+/).includes("notranslate")) return node;
      if (selector.includes("[contenteditable='true']") && node.getAttribute("contenteditable") === "true") return node;
    }
    return null;
  }
}

let checks = 0;
function pass(label) { checks++; console.log("PASS", label); }
for (const locale of ["en", "ru"]) {
  const plain = new ElementFixture({ title: "Alege" });
  const text = { nodeType: 3, parentElement: plain, nodeValue: "Alege" };
  plain.childNodes.push(text);
  applyElement(plain, locale);
  assert.notEqual(text.nodeValue, "Alege");
  assert.notEqual(plain.getAttribute("title"), "Alege");
  pass(`${locale}: ordinary UI still translates`);

  for (const attrs of [{ "data-no-auto-translate": "" }, { translate: "no" }, { class: "notranslate" }]) {
    for (const inherited of [false, true]) {
      const guarded = new ElementFixture(attrs);
      const leaf = inherited ? new ElementFixture({}, guarded) : guarded;
      leaf.setAttribute("title", "Alege");
      const original = "Alege";
      const text = { nodeType: 3, parentElement: leaf, nodeValue: original };
      leaf.childNodes.push(text);
      applyElement(leaf, locale);
      applyText(text, locale); // direct characterData observer callback
      applyAttribute(leaf, "title", locale); // direct attributes observer callback
      assert.equal(text.nodeValue, original);
      assert.equal(leaf.getAttribute("title"), original);
      // React inserts/updates a descendant after the initial scan.
      const newLeaf = new ElementFixture({ "aria-label": "Alege" }, leaf);
      const newText = { nodeType: 3, parentElement: newLeaf, nodeValue: original };
      newLeaf.childNodes.push(newText);
      applyElement(newLeaf, locale);
      applyAttribute(newLeaf, "aria-label", locale);
      assert.equal(newText.nodeValue, original);
      assert.equal(newLeaf.getAttribute("aria-label"), original);
      pass(`${locale}: ${Object.keys(attrs)[0]} ${inherited ? "ancestor" : "direct"} guards text, attributes and new descendants`);
    }
  }
}

for (const path of [
  "src/components/legal/contract-reader.tsx",
  "src/components/legal/e-signature.tsx",
  "src/components/legal/onboarding-agreement.tsx",
  "src/components/vendor/signed-documents-card.tsx",
  "src/app/[locale]/(public)/legal/[slug]/view.tsx",
  "src/app/[locale]/(admin)/admin/contracte/page.tsx",
]) {
  assert.match(read(path), /data-no-auto-translate translate="no"/);
  pass(`${path}: exact-content translation guard is mounted`);
}
for (const locale of ["ro", "ru", "en"]) {
  const copy = JSON.parse(read(`src/i18n/${locale}.json`));
  for (const text of [copy.legal.fixationNote, copy.vendor.signedDocs.retention, copy.adminUi.contracts.subtitle]) {
    assert.doesNotMatch(text, /Anex[aei]*\s*2|Annex\s*2|Приложени\S*\s*2/i);
  }
  pass(`${locale}: generic signing helpers do not refer artists to the venue-only Annex 2`);
}
const publicView = read("src/app/[locale]/(public)/legal/[slug]/view.tsx");
assert.match(publicView, /Boolean\(doc\.blocks\[locale\]\?\.length\)/);
assert.match(publicView, /isRomanianFallback/);
assert.match(read("src/components/legal/contract-reader.tsx"), /translation is not yet available/);
assert.match(read("src/app/[locale]/(admin)/admin/contracte/page.tsx"), /d\.documentTitleStored \?\?/);
pass("Romanian fallback is distinguished from a translation; admin uses the stored signed title");
console.log(`${checks} legal translation-integrity checks passed; no browser, external operations or evidence changes`);
