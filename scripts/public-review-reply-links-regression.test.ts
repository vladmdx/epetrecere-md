import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicReviewReply } from "../src/components/public/review-reply";
import { localizePath } from "../src/lib/i18n/routing";
import en from "../src/i18n/en.json";
import ro from "../src/i18n/ro.json";
import ru from "../src/i18n/ru.json";

for (const locale of ["ro", "ru", "en"] as const) {
  test(`${locale}: approved public reply has the localized label and preserves safe user text`, () => {
    const label = { ro, ru, en }[locale].artist.profile.replyLabel;
    const html = renderToStaticMarkup(createElement(PublicReviewReply, {
      isApproved: true, label, reply: "Mulțumim pentru recenzie!\nNe bucurăm că ați ales sala.",
    }));
    assert.match(html, /data-public-review-reply/);
    assert.ok(html.includes(label));
    assert.ok(html.includes("Mulțumim pentru recenzie!\nNe bucurăm că ați ales sala."));
    assert.match(html, /data-no-auto-translate/);
  });

  test(`${locale}: vendor links preserve the locale and point to actual public review sections`, () => {
    const prefix = locale === "ro" ? "" : `/${locale}`;
    assert.equal(localizePath("/sali/qa-test-venue#recenzii", locale), `${prefix}/sali/qa-test-venue#recenzii`);
    assert.equal(localizePath("/artisti/qa-test-artist#recenzii", locale), `${prefix}/artisti/qa-test-artist#recenzii`);
    assert.equal(localizePath("/sali/qa-test-venue", locale), `${prefix}/sali/qa-test-venue`);
  });
}

test("unapproved, unknown-approval, empty and missing replies cannot appear publicly", () => {
  for (const isApproved of [false, undefined]) {
    assert.equal(renderToStaticMarkup(createElement(PublicReviewReply, { isApproved, label: "Reply", reply: "Private moderation fixture" })), "");
  }
  for (const reply of [null, undefined, "", " \n "]) {
    assert.equal(renderToStaticMarkup(createElement(PublicReviewReply, { isApproved: true, label: "Reply", reply })), "");
  }
});

test("reply content is escaped React text, not HTML or an active contact link", () => {
  const html = renderToStaticMarkup(createElement(PublicReviewReply, {
    isApproved: true, label: "Reply", reply: '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="https://example.invalid">Link</a>',
  }));
  assert.doesNotMatch(html, /<(?:img|script|a)\b/);
  assert.match(html, /&lt;img/);
});

test("artist's two review areas and venue review cards render the approved reply without weakening server moderation", () => {
  for (const [kind, table, expected] of [["artisti", "artists", 2], ["sali", "venues", 1]] as const) {
    const client = readFileSync(`src/app/[locale]/(public)/${kind}/[slug]/client.tsx`, "utf8");
    assert.equal((client.match(/<PublicReviewReply reply=\{review\.reply\} isApproved=\{review\.isApproved\}/g) ?? []).length, expected);
    assert.match(client, /<section id="recenzii"/);
    const query = readFileSync(`src/lib/db/queries/${table}.ts`, "utf8");
    assert.match(query, /\.from\(reviews\)\s*\.where\(and\(eq\(reviews\.(?:artistId|venueId), (?:artist|venue)\.id\), eq\(reviews\.isApproved, true\)\)\)/);
  }
});

test("both reported raw navigation links now use the existing LocaleLink component", () => {
  const reviews = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/recenzii/client.tsx", "utf8");
  const bookings = readFileSync("src/app/[locale]/(vendor)/dashboard/rezervari/page.tsx", "utf8");
  for (const source of [reviews, bookings]) assert.match(source, /import Link from "@\/components\/shared\/locale-link"/);
  assert.match(reviews, /entitySlug\}#recenzii/);
  assert.doesNotMatch(reviews, /entitySlug\}#reviews/);
  assert.match(bookings, /<Link\s*href=\{`\/sali\/\$\{booking\.linkedVenue\.slug\}`\}/);
});
