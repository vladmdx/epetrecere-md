import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { guestHeadcount, assignedHeadcount, fitsAtTable } from "../src/lib/planner/guest-headcount";
import { lockSeatingPlan } from "../src/lib/planner/seating-capacity";

const single = { id: 1, guestType: "single", partySize: 1, kidsCount: 0, plusOnes: 0 };
const couple = { id: 2, guestType: "couple", partySize: 2, kidsCount: 0, plusOnes: 0 };
const family = { id: 3, guestType: "family", partySize: 3, kidsCount: 1, plusOnes: 0 };
const guests = [single, couple, family];

test("single, couple and family count adults plus children consistently", () => {
  assert.deepEqual(guests.map(guestHeadcount), [1, 2, 4]);
  assert.equal(guests.reduce((sum, guest) => sum + guestHeadcount(guest), 0), 7);
  assert.equal(guestHeadcount({ guestType: "single", partySize: 1, kidsCount: 2 }), 3);
  assert.equal(guestHeadcount({ guestType: "family", partySize: 8, kidsCount: 20 }), 28);
  assert.equal(guestHeadcount({ guestType: "couple", partySize: 1 }), 2);
});

test("legacy imported/migrated defaults preserve +1s without double-counting modern parties", () => {
  assert.equal(guestHeadcount({ plusOnes: 3 }), 4);
  assert.equal(guestHeadcount({ ...single, plusOnes: 3 }), 4);
  assert.equal(guestHeadcount({ partySize: null, kidsCount: null, plusOnes: 2 }), 3);
  assert.equal(guestHeadcount({ ...family, plusOnes: 3 }), 4);
  assert.equal(guestHeadcount({ plusOnes: -2, partySize: NaN, kidsCount: Infinity }), 1);
  assert.equal(guestHeadcount(null), 0);
});

test("table capacity rejects a household that cannot fit and keeps intra-table retries idempotent", () => {
  assert.equal(fitsAtTable(6, [single, couple], family), false); // 3 + 4
  assert.equal(fitsAtTable(7, [single, couple], family), true);
  assert.equal(fitsAtTable(7, guests, family), true); // same assignment is not doubled
  assert.equal(fitsAtTable(7, guests, { ...family, kidsCount: 2 }), false);
  assert.equal(fitsAtTable(7, guests, { ...family, kidsCount: 0 }), true);
});

test("moving/deleting a group updates all occupied seats, without phantom or duplicate assignments", () => {
  const seats = [{ guestId: 1, tableId: 10 }, { guestId: 2, tableId: 10 }, { guestId: 3, tableId: 20 }];
  assert.equal(assignedHeadcount(seats.filter(s => s.tableId === 10), guests), 3);
  assert.equal(assignedHeadcount(seats.filter(s => s.tableId === 20), guests), 4);
  const moved = seats.map(s => s.guestId === 2 ? { ...s, tableId: 20 } : s);
  assert.equal(assignedHeadcount(moved.filter(s => s.tableId === 10), guests), 1);
  assert.equal(assignedHeadcount(moved.filter(s => s.tableId === 20), guests), 6);
  assert.equal(assignedHeadcount(moved, guests.filter(g => g.id !== 3)), 3);
  assert.equal(assignedHeadcount([...moved, moved[1], { guestId: 999 }], guests), 7);
});

test("owner-scoped plan lock is taken with FOR UPDATE before the capacity snapshot", async () => {
  let query: unknown;
  let locking = "";
  const tx = { select: () => ({ from: () => ({ where: (where: unknown) => {
    query = where;
    return { for: async (kind: string) => { locking = kind; return [{ id: 99 }]; } };
  } }) }) };
  assert.equal(await lockSeatingPlan(tx as never, 99, "fixture-owner"), true);
  assert.equal(locking, "update");
  const rendered = new PgDialect().sqlToQuery(query as never);
  assert.match(rendered.sql, /event_plans.*id.*user_id/);
  assert.deepEqual(rendered.params, [99, "fixture-owner"]);
  const absent = { select: () => ({ from: () => ({ where: () => ({ for: async () => [] }) }) }) };
  assert.equal(await lockSeatingPlan(absent as never, 99, "wrong-owner"), false);
});

test("isolated lock model serializes competing capacity writes; only one last-seat request fits", async () => {
  // No database access: model FOR UPDATE scheduling, exercise the production
  // lock + capacity predicates. Live locking behaviour still needs DB QA.
  let tail = Promise.resolve();
  const occupants = [single];
  async function request(incoming: typeof couple) {
    let release!: () => void;
    const prior = tail;
    tail = new Promise<void>(resolve => { release = resolve; });
    const tx = { select: () => ({ from: () => ({ where: () => ({ for: async () => {
      await prior;
      return [{ id: 99 }];
    } }) }) }) };
    try {
      await lockSeatingPlan(tx as never, 99, "fixture-owner");
      await Promise.resolve();
      if (!fitsAtTable(3, occupants, incoming)) return false;
      occupants.push(incoming);
      return true;
    } finally { release(); }
  }
  assert.deepEqual(await Promise.all([request(couple), request({ ...couple, id: 4 })]), [true, false]);
  assert.equal(occupants.reduce((sum, g) => sum + guestHeadcount(g), 0), 3);
});

test("all capacity-changing API paths share the transaction lock, ownership and party-aware predicate", () => {
  const seats = readFileSync("src/app/api/event-plans/[id]/seats/route.ts", "utf8");
  const tables = readFileSync("src/app/api/event-plans/[id]/tables/[tableId]/route.ts", "utf8");
  const guest = readFileSync("src/app/api/event-plans/[id]/guests/[guestId]/route.ts", "utf8");
  for (const source of [seats, tables, guest]) {
    assert.equal((source.match(/db\.transaction/g) ?? []).length, 2);
    assert.equal((source.match(/await lockSeatingPlan\(tx, planId, owned\.userId\)/g) ?? []).length, 2);
    assert.ok(source.indexOf("await lockSeatingPlan") < source.indexOf("await tableOccupants"));
    assert.match(source, /TABLE_FULL/);
  }
  assert.doesNotMatch(seats, /count\(\*\)|count >= table\.seats/);
  assert.match(seats, /fitsAtTable\(table\.seats/);
  assert.match(seats, /target: seatAssignments\.guestId/);
  assert.match(tables, /parsed\.data\.seats < occupied/);
  assert.match(guest, /guestHeadcount\(next\) > guestHeadcount\(current\)/);
  assert.match(guest, /fitsAtTable\(placement\.seats/);
});

test("overview, guest list, seating and auto-place all use party-aware counts", () => {
  const overview = readFileSync("src/app/[locale]/(client)/cabinet/planifica/[id]/page.tsx", "utf8");
  const seating = readFileSync("src/components/planner/seating-view.tsx", "utf8");
  const list = readFileSync("src/components/planner/guests-view.tsx", "utf8");
  for (const source of [overview, seating, list]) assert.match(source, /guestHeadcount\(/);
  assert.match(overview, /assignedHeadcount\(seats, guests\)/);
  assert.match(overview, /current\.filter\(seat => ids\.has\(seat\.guestId\)\)/);
  assert.match(seating, /t\.free >= people/);
  assert.match(seating, /target\.free -= people/);
  assert.match(seating, /if \(!target\) continue/);
  assert.match(seating, /const occupiedPeople = assignedHeadcount\(assigned, guests\)/);
  assert.match(seating, /assigned: assignedHeadcount\(assigned, guests\)/);
  assert.match(seating, /placedAccepted/);
  assert.doesNotMatch(seating, /seats\.push\(|sum \+ 1 \+ \(g\.plusOnes|assigned: assigned\.length/);
});
