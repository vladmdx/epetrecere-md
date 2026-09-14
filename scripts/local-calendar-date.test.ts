import assert from "node:assert/strict";
import { test } from "node:test";
import { localDateToIsoDate } from "../packages/shared/src/utils/index";

// Fix the process timezone before constructing Date values. These regressions
// deliberately cover Moldova's positive UTC offset and both DST boundaries.
process.env.TZ = "Europe/Chisinau";

test("preserves a Moldova local-midnight calendar choice", () => {
  const selected = new Date(2026, 8, 14, 0, 0, 0, 0);
  assert.equal(localDateToIsoDate(selected), "2026-09-14");
  assert.equal(selected.toISOString().slice(0, 10), "2026-09-13");
});

test("preserves dates on Moldova DST transition days", () => {
  assert.equal(localDateToIsoDate(new Date(2026, 2, 29)), "2026-03-29");
  assert.equal(localDateToIsoDate(new Date(2026, 9, 25)), "2026-10-25");
});

test("pads early years and rejects invalid Date objects", () => {
  const selected = new Date(0);
  selected.setFullYear(42, 0, 3);
  selected.setHours(0, 0, 0, 0);
  assert.equal(localDateToIsoDate(selected), "0042-01-03");
  assert.throws(
    () => localDateToIsoDate(new Date(Number.NaN)),
    /Invalid local calendar date/,
  );
});

test("web and mobile booking forms use the shared local serializer", async () => {
  const { readFile } = await import("node:fs/promises");
  const web = await readFile(
    new URL("../src/components/public/request-form.tsx", import.meta.url),
    "utf8",
  );
  const mobile = await readFile(
    new URL("../packages/mobile/app/(client)/booking-new.tsx", import.meta.url),
    "utf8",
  );

  for (const source of [web, mobile]) {
    assert.match(source, /localDateToIsoDate\(eventDate\)/);
    assert.doesNotMatch(
      source,
      /eventDate\.toISOString\(\)\.(?:slice\(0, 10\)|split\("T"\)\[0\])/,
    );
  }
});
