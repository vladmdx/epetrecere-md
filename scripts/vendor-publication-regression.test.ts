import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicationStatusNotice } from "../src/components/vendor/publication-status-notice";
import { t } from "../src/i18n";

for (const locale of ["ro", "ru", "en"] as const) {
  for (const isActive of [false, true]) {
    test(`${locale}: publication notice reflects the persisted active flag (${isActive})`, () => {
      const state = isActive ? "published" : "unpublished";
      const opposite = isActive ? "unpublished" : "published";
      const html = renderToStaticMarkup(createElement(PublicationStatusNotice, { isActive, locale }));
      assert.match(html, new RegExp(`data-publication-state="${state}"`));
      assert.ok(html.includes(t(`vendor.publication.${state}Title`, locale)));
      assert.ok(html.includes(t(`vendor.publication.${state}Description`, locale)));
      assert.ok(!html.includes(t(`vendor.publication.${opposite}Title`, locale)));
      assert.ok(!html.includes("vendor.publication."));
    });
  }

  test(`${locale}: empty bookings state makes no unconditional publication claim`, () => {
    const text = t("vendor.home.noRequests", locale);
    assert.notEqual(text, "vendor.home.noRequests");
    assert.doesNotMatch(text, /online|онлайн|profil|профил/i);
    for (const state of ["published", "unpublished"]) {
      for (const field of ["Title", "Description"]) {
        const key = `vendor.publication.${state}${field}`;
        assert.notEqual(t(key, locale), key);
      }
    }
  });
}

test("missing publication state fails closed", () => {
  const html = renderToStaticMarkup(createElement(PublicationStatusNotice, { isActive: undefined as unknown as boolean, locale: "en" }));
  assert.match(html, /data-publication-state="unpublished"/);
});

test("phone registration notice discloses bilateral booking contact sharing in every language", () => {
  const notices = {
    ro: /confirmarea finală.*ambele părți/,
    ru: /окончательного подтверждения.*обеими сторонами/,
    en: /final confirmation.*both parties/,
  };
  for (const locale of ["ro", "ru", "en"] as const) {
    assert.match(t("auth.phoneHint", locale), notices[locale]);
    assert.doesNotMatch(t("auth.phoneHint", locale), /doar tu|only you|только вам/);
  }
});

test("both dashboard server pages pass their authenticated owner's active flag", () => {
  for (const [path, entity] of [
    ["src/app/[locale]/(vendor)/dashboard/page.tsx", "artist"],
    ["src/app/[locale]/(vendor)/dashboard/sala/page.tsx", "venue"],
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, new RegExp(`isActive: ${entity}s\\.isActive`));
    assert.match(source, new RegExp(`eq\\(${entity}s\\.userId, appUser\\.id\\)`));
    assert.ok(source.includes(`isActive={${entity}.isActive}`));
    assert.doesNotMatch(source, /redirect\("\/(?:dashboard|cabinet|sign-in)/);
  }
});

test("dashboard quick links preserve language and unpublished venues have no public-profile shortcut", () => {
  for (const path of [
    "src/components/vendor/dashboard-client.tsx",
    "src/app/[locale]/(vendor)/dashboard/page.tsx",
    "src/app/[locale]/(vendor)/dashboard/sala/home-client.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /import Link from "@\/components\/shared\/locale-link"/);
    assert.doesNotMatch(source, /from "next\/link"/);
  }
  const artist = readFileSync("src/components/vendor/dashboard-client.tsx", "utf8");
  const venue = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/home-client.tsx", "utf8");
  for (const source of [artist, venue]) assert.match(source, /<PublicationStatusNotice isActive=\{isActive\} locale=\{locale\}/);
  assert.match(venue, /\{isActive && <Link\s+href=\{`\/sali\//);
});
