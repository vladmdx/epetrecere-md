import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const personalizedCatalogPages = [
  "src/app/[locale]/(public)/artisti/page.tsx",
  "src/app/[locale]/(public)/sali/page.tsx",
  "src/app/[locale]/(public)/artisti/in/[city]/page.tsx",
  "src/app/[locale]/(public)/sali/in/[city]/page.tsx",
  "src/app/[locale]/(public)/categorie/[slug]/page.tsx",
  "src/app/[locale]/(public)/artisti/in/[city]/[category]/page.tsx",
];

test("personalized public catalogue pages cannot enter the shared Full Route Cache", async () => {
  for (const path of personalizedCatalogPages) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");

    assert.match(source, /await auth\(\)/, `${path} must still gate prices by session`);
    assert.match(
      source,
      /export const dynamic\s*=\s*["']force-dynamic["'];/,
      `${path} must explicitly render per request`,
    );
    assert.doesNotMatch(
      source,
      /export const revalidate\s*=\s*(?!0\b)\d+/,
      `${path} must not opt personalized HTML into shared ISR`,
    );
    assert.match(
      source,
      /publicCatalogData\([^;]*Boolean\(userId\)\)/s,
      `${path} must keep anonymous prices redacted at the server boundary`,
    );
  }
});

test("artist directory does not pipeline an extra catalogue lookup", async () => {
  const path = "src/app/[locale]/(public)/artisti/page.tsx";
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");

  assert.doesNotMatch(
    source,
    /Promise\.all\s*\(/,
    `${path} must keep getArtists and getAllCategories serial`,
  );
  assert.match(source, /await getArtists\(filters\);[\s\S]*await getAllCategories\(\);/);
});
