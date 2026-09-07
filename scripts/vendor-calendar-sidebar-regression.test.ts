import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { CalendarWeekdays } from "../src/components/shared/calendar-weekdays";
import { publishedVendorProfileHref } from "../src/lib/vendors/publication";
import { eventTypeLabel, ALL_EVENT_TYPES } from "../src/lib/events/normalize";
import { t } from "../src/i18n";

for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: seven Monday-first weekday abbreviations have full accessible names and resist automatic translation`, () => {
    const html = renderToStaticMarkup(createElement(CalendarWeekdays, { locale }));
    assert.match(html, /data-no-auto-translate/);
    assert.match(html, /translate="no"/);
    const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(labels, weekdays.map((day) => t(`date.weekday.${day}`, locale)));
    for (const day of weekdays) assert.ok(html.includes(`>${t(`date.weekdayShort.${day}`, locale)}</div>`));
    if (locale === "en") {
      assert.match(html, /aria-label="Tuesday"/);
      assert.match(html, />Tu<\/div>/);
      assert.doesNotMatch(html, />You<\/div>/);
    }
  });

  test(`${locale}: all event types have a localized label`, () => {
    assert.equal(ALL_EVENT_TYPES.length, 10);
    for (const key of ALL_EVENT_TYPES) assert.ok(eventTypeLabel(key, locale).length > 2);
    if (locale !== "ro") {
      for (const key of ["proposal", "cununie", "kids_birthday"] as const) {
        assert.notEqual(eventTypeLabel(key, locale), eventTypeLabel(key, "ro"));
      }
    }
  });
}

for (const kind of ["artist", "venue"] as const) {
  test(`${kind}: public profile shortcut requires active owner record with slug`, () => {
    for (const profile of [undefined, null, {}, { slug: "qa-profile" }, { slug: "qa-profile", isActive: false }, { slug: "qa-profile", isActive: null }, { slug: "", isActive: true }, { isActive: true }]) {
      assert.equal(publishedVendorProfileHref(profile, kind), null);
    }
    assert.equal(publishedVendorProfileHref({ slug: "qa-profile", isActive: true }, kind), `/${kind === "artist" ? "artisti" : "sali"}/qa-profile`);
  });
}

test("venue event label calls always receive locale, including nested cards and list views", () => {
  for (const path of ["src/app/[locale]/(vendor)/dashboard/sala/home-client.tsx", "src/app/[locale]/(vendor)/dashboard/sala/calendar/client.tsx"]) {
    const source = readFileSync(path, "utf8");
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let labels = 0;
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["eventTypeLabel", "eventTypeVisual"].includes(node.expression.text)) {
        labels++;
        assert.equal(node.arguments.length, 2, `${path}: ${node.getText(file)}`);
        assert.equal(node.arguments[1].getText(file), "locale");
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    assert.ok(labels >= 2);
    assert.doesNotMatch(source, /toLocaleDateString\("ro-RO"/);
    assert.match(source, /<CalendarWeekdays locale=\{locale\}/);
  }
  const artistCalendar = readFileSync("src/app/[locale]/(vendor)/dashboard/calendar/page.tsx", "utf8");
  assert.match(artistCalendar, /<CalendarWeekdays locale=\{locale\}/);
});

test("both sidebar layouts fail closed and preserve localized profile links on desktop and mobile", () => {
  const artist = readFileSync("src/components/vendor/vendor-sidebar.tsx", "utf8");
  const venue = readFileSync("src/components/vendor/venue-sidebar.tsx", "utf8");
  for (const source of [artist, venue]) {
    assert.match(source, /import Link from "@\/components\/shared\/locale-link"/);
    assert.match(source, /publishedVendorProfileHref\(/);
    assert.equal([...source.matchAll(/\{profileHref &&/g)].length, 2);
  }
  assert.match(artist, /publishedVendorProfileHref\(data\.artist, "artist"\)/);
  assert.match(artist, /publishedVendorProfileHref\(venueData\.venue, "venue"\)/);
  assert.match(artist, /\}, \[pathname\]\)/);
  const layout = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/layout.tsx", "utf8");
  assert.match(layout, /isActive: venues\.isActive/);
  assert.match(layout, /eq\(venues\.userId, appUser\.id\)/);
  assert.match(layout, /isActive=\{venueRecord\?\.isActive === true\}/);
});
