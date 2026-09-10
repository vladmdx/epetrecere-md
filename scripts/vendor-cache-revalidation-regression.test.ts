import assert from "node:assert/strict";
import { test } from "node:test";
import { vendorCatalogPaths } from "../src/lib/vendors/revalidate";

test("publication invalidation uses concrete public artist URLs in every locale", () => {
  assert.deepEqual(
    vendorCatalogPaths("artist", {
      profileSlugs: ["formatia-lux", "formatia-lux", null, ""],
      directory: true,
      categorySlugs: ["formatii"],
      homepage: true,
      services: true,
    }),
    [
      "/", "/ru", "/en", "/ro",
      "/servicii", "/ru/servicii", "/en/servicii", "/ro/servicii",
      "/artisti", "/ru/artisti", "/en/artisti", "/ro/artisti",
      "/artisti/formatia-lux", "/ru/artisti/formatia-lux", "/en/artisti/formatia-lux", "/ro/artisti/formatia-lux",
      "/categorie/formatii", "/ru/categorie/formatii", "/en/categorie/formatii", "/ro/categorie/formatii",
    ],
  );
});

test("a review reply can invalidate one venue profile without catalog fan-out", () => {
  assert.deepEqual(
    vendorCatalogPaths("venue", { profileSlugs: ["sala-regala"] }),
    [
      "/sali/sala-regala",
      "/ru/sali/sala-regala",
      "/en/sali/sala-regala",
      "/ro/sali/sala-regala",
    ],
  );
});

test("unknown profile slugs never fall back to a dynamic wildcard", () => {
  const paths = vendorCatalogPaths("artist", {
    directory: true,
    homepage: true,
    profileSlugs: [undefined, null, "  "],
  });

  assert.deepEqual(paths, [
    "/", "/ru", "/en", "/ro",
    "/artisti", "/ru/artisti", "/en/artisti", "/ro/artisti",
  ]);
  assert.ok(paths.every((path) => !path.includes("[") && !path.includes("(public)")));
});

test("slugs remain a single encoded public path segment", () => {
  assert.deepEqual(
    vendorCatalogPaths("artist", { profileSlugs: ["artist/test"] }),
    [
      "/artisti/artist%2Ftest",
      "/ru/artisti/artist%2Ftest",
      "/en/artisti/artist%2Ftest",
      "/ro/artisti/artist%2Ftest",
    ],
  );
});
