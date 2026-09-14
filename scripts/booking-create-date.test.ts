import assert from "node:assert/strict";
import { test } from "node:test";
import { currentChisinauDate } from "../src/lib/booking/booking-create-date";

test("Moldova date has already advanced while UTC is still yesterday", () => {
  assert.equal(
    currentChisinauDate(new Date("2026-09-13T21:30:00.000Z")),
    "2026-09-14",
  );
});

test("Moldova new year boundary uses winter offset", () => {
  assert.equal(
    currentChisinauDate(new Date("2026-12-31T22:30:00.000Z")),
    "2027-01-01",
  );
});
