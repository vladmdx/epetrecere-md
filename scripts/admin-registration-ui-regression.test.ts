import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { profileDescriptionSummary } from "../src/lib/content/profile-description-summary";
import { localizePath, splitLocale } from "../src/lib/i18n/routing";

test("venue rich editor HTML becomes readable plain text without joined paragraphs", () => {
  assert.equal(profileDescriptionSummary("<p><strong>QA Test Sală</strong> &amp; evenimente</p><p>Bălți<br>30–150 invitați</p>"), "QA Test Sală & evenimente Bălți 30–150 invitați");
});

test("artist Markdown becomes a readable summary without changing stored input", () => {
  const input = "## **QA Test Foto Video**\n\nServicii _foto_ și **video**.\n- [Portofoliu](https://example.invalid)\n- `Evenimente` în Bălți";
  assert.equal(profileDescriptionSummary(input), "QA Test Foto Video Servicii foto și video. Portofoliu Evenimente în Bălți");
  assert.match(input, /\*\*QA Test Foto Video\*\*/);
});

test("plain multilingual content, empty values and ordinary underscores are preserved", () => {
  assert.equal(profileDescriptionSummary("  Ședințe foto în Bălți. Фото и видео. Photo & video. stage_name  "), "Ședințe foto în Bălți. Фото и видео. Photo & video. stage_name");
  assert.equal(profileDescriptionSummary(null), "");
  assert.equal(profileDescriptionSummary(undefined), "");
});

test("untrusted profile content is never rendered as an element or a live link", () => {
  const input = '<script>alert(1)</script><style>body{display:none}</style><img src=x onerror=alert(2)><p>Profile &lt;img src=x onerror=alert(3)&gt; [Click](javascript:alert)</p>';
  const text = profileDescriptionSummary(input);
  const html = renderToStaticMarkup(createElement("p", {}, text));
  assert.doesNotMatch(text, /alert\(1\)|display:none|javascript:/);
  assert.doesNotMatch(html, /<(?:script|style|img|a)\b/i);
  assert.match(html, /&lt;img/);
  assert.match(html, /Click/);
});

test("registration card uses the plain text summary without transforming signed documents", () => {
  const source = readFileSync("src/app/[locale]/(admin)/admin/cereri-inregistrare/page.tsx", "utf8");
  assert.match(source, /\{profileDescriptionSummary\(req\.description\)\}/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.match(source, /\{contract\.documentTitle \|\| copy\.contracts\}/);
  assert.match(source, /href=\{contract\.copyUrl\}/);
  assert.equal(source.match(/profileDescriptionSummary\(/g)?.length, 1);
});

for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: admin navigation keeps the language and recognizes active sections`, () => {
    for (const path of ["/admin", "/admin/cereri-inregistrare", "/admin/contracte", "/admin/artisti/561", "/"]) {
      const localized = localizePath(path, locale);
      const expectedPrefix = locale === "ro" ? "" : `/${locale}`;
      assert.equal(localized, `${expectedPrefix}${path === "/" && expectedPrefix ? "" : path}`);
      assert.equal(splitLocale(localized).pathname, path);
    }
  });
}

test("both desktop and mobile admin shell links use locale retention", () => {
  const sidebar = readFileSync("src/components/admin/admin-sidebar.tsx", "utf8");
  assert.match(sidebar, /import Link from "@\/components\/shared\/locale-link"/);
  assert.doesNotMatch(sidebar, /from "next\/link"/);
  assert.match(sidebar, /const pathname = splitLocale\(usePathname\(\) \|\| "\/"\)\.pathname/);
  assert.match(sidebar, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.equal((sidebar.match(/<NavList/g) ?? []).length, 2);
});
