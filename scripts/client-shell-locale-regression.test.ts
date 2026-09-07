import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { localizePath, splitLocale } from "../src/lib/i18n/routing";

const sidebar = readFileSync("src/components/client/client-sidebar.tsx", "utf8");
const home = readFileSync("src/app/[locale]/(client)/cabinet/page.tsx", "utf8");
const layout = readFileSync("src/app/[locale]/(client)/cabinet/layout.tsx", "utf8");

test("desktop and mobile client sidebar links preserve the selected language", () => {
  assert.match(sidebar, /import Link from "@\/components\/shared\/locale-link"/);
  assert.doesNotMatch(sidebar, /from "next\/link"/);
  assert.match(sidebar, /const pathname = splitLocale\(usePathname\(\) \|\| "\/"\)\.pathname/);
  assert.equal((sidebar.match(/<NavBody/g) ?? []).length, 2);
  assert.match(sidebar, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(sidebar, /pathname\.startsWith\(item\.href \+ "\/"\)/);
});

test("empty dashboard Start planning and populated dashboard links use LocaleLink", () => {
  assert.match(home, /import Link from "@\/components\/shared\/locale-link"/);
  assert.doesNotMatch(home, /from "next\/link"/);
  assert.match(home, /<Link\s+href="\/planifica"/);
  assert.match(home, /href=\{`\/cabinet\/planifica\/\$\{plan\.id\}`\}/);
});

test("client role gate preserves locale without changing its authorization predicates", () => {
  assert.match(layout, /params: Promise<\{ locale: string \}>/);
  assert.match(layout, /const locale = isLocale\(rawLocale\) \? rawLocale : DEFAULT_LOCALE/);
  assert.match(layout, /redirect\(localizePath\("\/dashboard", locale\)\)/);
  assert.match(layout, /if \(artistOwn \|\| venueOwn \|\| appUser\.role === "artist"\)/);
  assert.match(layout, /redirect\(await signInPath\(\)\)/);
  assert.doesNotMatch(layout, /redirect\("\/dashboard"\)/);
});

for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: static sidebar, event, calculator and start planning destinations retain locale`, () => {
    const paths = [
      "/cabinet", "/cabinet/rezervari", "/cabinet/favorite", "/cabinet/mesaje",
      "/cabinet/recenzii", "/cabinet/profil", "/cabinet/checklist", "/cabinet/invitatii",
      "/cabinet/moments", "/cabinet/planifica", "/cabinet/planifica/123", "/cabinet/arhiva",
      "/calculatoare/buget", "/planifica", "/dashboard", "/",
    ];
    for (const path of paths) {
      const localized = localizePath(path, locale);
      assert.equal(splitLocale(localized).locale, locale);
      assert.equal(splitLocale(localized).pathname, path);
    }
  });

  test(`${locale}: only the intended static section is active for a nested booking path`, () => {
    const pathname = splitLocale(localizePath("/cabinet/rezervari/123", locale)).pathname;
    const nav = ["/cabinet", "/cabinet/rezervari", "/cabinet/favorite", "/cabinet/mesaje"];
    const active = nav.filter(href => pathname === href || (href !== "/cabinet" && pathname.startsWith(href + "/")));
    assert.deepEqual(active, ["/cabinet/rezervari"]);
  });
}
