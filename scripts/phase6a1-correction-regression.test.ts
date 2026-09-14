import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { legacySalaPathForCanonicalVenue } from "../src/lib/partner/multi-hall-redirect";

function withFlag(on: boolean, fn: () => void) {
  const previous = process.env.FEATURE_MULTI_HALL;
  if (on) process.env.FEATURE_MULTI_HALL = "1";
  else delete process.env.FEATURE_MULTI_HALL;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.FEATURE_MULTI_HALL;
    else process.env.FEATURE_MULTI_HALL = previous;
  }
}

test("canonical venue notification paths survive a feature-flag rollback", () => {
  withFlag(true, () => {
    assert.equal(
      legacySalaPathForCanonicalVenue("/dashboard/locatii/10/rezervari"),
      null,
    );
  });
  withFlag(false, () => {
    assert.equal(
      legacySalaPathForCanonicalVenue("/dashboard/locatii/10/rezervari"),
      "/dashboard/sala/rezervari",
    );
    assert.equal(
      legacySalaPathForCanonicalVenue("/dashboard/locatii/20/recenzii"),
      "/dashboard/sala/recenzii",
    );
    assert.equal(
      legacySalaPathForCanonicalVenue("/dashboard/locatii/20/mesaje"),
      "/dashboard/sala/mesaje",
    );
    assert.equal(
      legacySalaPathForCanonicalVenue("/dashboard/locatii/20/sali"),
      "/dashboard/sala",
    );
    assert.equal(
      legacySalaPathForCanonicalVenue("/dashboard/locatii/0/rezervari"),
      null,
    );
    assert.equal(
      legacySalaPathForCanonicalVenue("/dashboard/locatii/20/rezervari/extra"),
      null,
    );
  });
});

test("middleware preserves locale and existing query while redirecting rollback links", () => {
  const source = readFileSync("src/middleware.ts", "utf8");
  const start = source.indexOf("const legacySalaPath =");
  const end = source.indexOf("// Legacy SEO redirects", start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /legacySalaPathForCanonicalVenue\(pathname\)/);
  assert.match(block, /url\.pathname = localizePath\(legacySalaPath, locale\)/);
  assert.match(block, /NextResponse\.redirect\(url, 307\)/);
  assert.doesNotMatch(block, /url\.search\s*=|searchParams\.delete|new URL\(/);
});
