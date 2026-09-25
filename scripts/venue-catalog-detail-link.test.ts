import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { venueCatalogDetailHref } from "../src/lib/venues/catalog-detail-link";
import { parseCatalogFilters } from "../src/lib/venues/catalog-filters";
import { localizePath } from "../src/lib/i18n/routing";

const href = (query: string) => venueCatalogDetailHref("demo-nord", new URLSearchParams(query));

test("200+ guests stays applied when opening the venue", () => {
  assert.equal(href("capacity_min=200"), "/sali/demo-nord?guest_count=200");
  const query = new URL(href("capacity_min=200"), "https://example.test").searchParams;
  assert.equal(parseCatalogFilters(Object.fromEntries(query)).guestCount, 200);
});

test("date and overnight interval survive catalog aliases", () => {
  const result = href("capacity_min=100&date=2026-10-22&start_time=18:00&end_time=02:00");
  assert.equal(result, "/sali/demo-nord?guest_count=100&date=2026-10-22&start=18%3A00&end=02%3A00");
  const parsed = parseCatalogFilters(Object.fromEntries(new URL(result, "https://example.test").searchParams));
  assert.equal(parsed.intervalComplete, true);
  assert.equal(parsed.startTime, "18:00");
  assert.equal(parsed.endTime, "02:00");
});

test("canonical aliases have the same precedence as the catalog", () => {
  assert.equal(href("guest_count=150&capacity_min=200&start=10:00&start_time=11:00&end=15:00&end_time=16:00"),
    "/sali/demo-nord?guest_count=150&start=10%3A00&end=15%3A00");
});

test("no filters means the old bare URL, list-only and unrelated params are excluded", () => {
  assert.equal(href(""), "/sali/demo-nord");
  assert.equal(href("sort=rating&page=2&city=Chisinau&hall=other-venue&email=private&redirect=https://example.test"), "/sali/demo-nord");
});

test("partial and malformed constraints are not silently removed by the link builder", () => {
  assert.equal(href("date=2026-10-22"), "/sali/demo-nord?date=2026-10-22");
  assert.equal(href("guest_count=invalid&date=invalid"), "/sali/demo-nord?guest_count=invalid&date=invalid");
  assert.equal(href("guest_count=&capacity_min=200"), "/sali/demo-nord");
});

test("all locale links retain booking context and encode the slug safely", () => {
  const path = href("capacity_min=200");
  for (const locale of ["ro", "ru", "en"] as const) {
    assert.equal(localizePath(path, locale), `${locale === "ro" ? "" : `/${locale}`}${path}`);
  }
  assert.equal(venueCatalogDetailHref("a?hall=x", new URLSearchParams()), "/sali/a%3Fhall%3Dx");
});

test("grid, both list links and shared Google/Leaflet map panel consume contextual URLs", () => {
  const client = readFileSync("src/app/[locale]/(public)/sali/client.tsx", "utf8");
  const card = readFileSync("src/components/public/venue-card.tsx", "utf8");
  const map = readFileSync("src/components/public/venues-map-shared.tsx", "utf8");
  assert.equal((client.match(/detailHref=\{venueCatalogDetailHref\(venue.slug, searchParams\)\}/g) ?? []).length, 2);
  assert.match(client, /detailHref: venueCatalogDetailHref\(v.slug, searchParams\)/);
  assert.equal((client.match(/<Link href=\{detailHref\}/g) ?? []).length, 2);
  assert.match(card, /href=\{detailHref \?\? `/);
  assert.match(map, /href=\{v.detailHref \?\? `/);
  for (const file of ["venues-map-inner.tsx", "venues-map-google.tsx"]) {
    assert.match(readFileSync(`src/components/public/${file}`, "utf8"), /venues-map-shared/);
  }
});
