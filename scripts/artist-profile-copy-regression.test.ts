import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { profileDescriptionSummary } from "../src/lib/content/profile-description-summary";

for (const [locale, text] of Object.entries({
  ro: "Servicii pentru evenimente • portofoliu • rezervări online",
  ru: "Услуги для мероприятий • портфолио • онлайн-бронирование",
  en: "Event services • portfolio • online booking",
})) {
  test(`${locale}: profile tagline is truthful for photographers and other non-musical services`, () => {
    const catalog = JSON.parse(readFileSync(`src/i18n/${locale}.json`, "utf8"));
    assert.equal(catalog.artist.profile.tagline, text);
    assert.doesNotMatch(catalog.artist.profile.tagline, /live|music|premium|музык|премиум|muzic|show/i);
    const format = { ro: "În funcție de serviciu", ru: "Зависит от услуги", en: "Depends on the service" };
    assert.equal(catalog.artist.profile.fact.formatValue, format[locale as keyof typeof format]);
    assert.doesNotMatch(catalog.artist.profile.fact.formatValue, /live|interacti|интерактив|живой/i);
  });
}

test("localized Markdown/HTML profile descriptions display as text without changing the source", () => {
  for (const input of [
    "**QA Test Foto Video Bălți**\n\nFoto și _video_ pentru evenimente.",
    "**Фото и видео**\n\nСъёмка _мероприятий_.",
    "<p><strong>Photo &amp; Video</strong></p><p>Events in Bălți.</p>",
  ]) {
    const original = input;
    const summary = profileDescriptionSummary(input);
    assert.doesNotMatch(summary, /\*\*|<\/?p>|_мероприятий_|_video_/);
    assert.equal(input, original);
    const html = renderToStaticMarkup(createElement("p", {}, summary));
    assert.equal((html.match(/<p>/g) ?? []).length, 1);
    assert.doesNotMatch(html, /\*\*/);
  }
});

test("untrusted description is never interpreted as executable HTML", () => {
  const summary = profileDescriptionSummary('<script>alert(1)</script><img src=x onerror=alert(2)>**Photo** &lt;img onerror=alert(3)&gt;');
  const html = renderToStaticMarkup(createElement("p", {}, summary));
  assert.doesNotMatch(html, /<(?:script|img)\b|alert\(1\)|\*\*/);
  assert.match(html, /Photo/);
});

test("hero excerpt, About tab and metadata use the shared presentation-only summary", () => {
  const client = readFileSync("src/app/[locale]/(public)/artisti/[slug]/client.tsx", "utf8");
  const page = readFileSync("src/app/[locale]/(public)/artisti/[slug]/page.tsx", "utf8");
  assert.match(client, /const descriptionText = profileDescriptionSummary\(description\)/);
  assert.equal((client.match(/\{descriptionText\}/g) ?? []).length, 2);
  assert.doesNotMatch(client, /description\.replace|<p>\{description\}<\/p>|dangerouslySetInnerHTML/);
  assert.match(page, /const excerpt = profileDescriptionSummary\(/);
  assert.match(client, /src=\{profilePhotoUrl\}/, "hero photograph remains unchanged");
});
