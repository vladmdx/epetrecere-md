import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { bookingTextForViewer, calendarEventForViewer } from "../src/lib/privacy/booking-text";
import { contactsAreShared } from "../src/lib/privacy/booking-contact";
import { containsContact } from "../src/lib/privacy/contact-redaction";
import { visiblePriceOffers } from "../src/lib/booking/negotiation";

for (const status of ["pending", "accepted", "rejected", "cancelled"]) {
  test(`${status}: emails and phones in names, labels and encoded prose stay private`, () => {
    for (const value of ["Ana test@example.com", "Sala +373 69 123 456", "Foto www.example.md",
      "Ion test&#64;example.com", "<p>Ana &#43;373 69 123 456</p>", "Mihai t.me/example",
      "Maria test\u200b@example.com"]) {
      const safe = bookingTextForViewer(value, contactsAreShared(status));
      assert.equal(containsContact(safe), false, value);
      assert.ok(!safe.includes("test@example.com") && !safe.includes("&#64;"), value);
    }
    for (const value of ["Ana Popescu", "Иван Петров", "John O'Connor", "Foto Video Bălți",
      "20.09.2026 14:00", "2026-09-20", "Nuntă, 60 invitați, 14:00–00:00"]) {
      assert.equal(bookingTextForViewer(value, contactsAreShared(status)), value);
    }
  });
}

test("authorized own/admin/final contact projection is unchanged and null stays null", () => {
  const name = "Ana test@example.com +373 69 123 456";
  for (const status of ["confirmed_by_client", "completed"]) {
    assert.equal(bookingTextForViewer(name, contactsAreShared(status)), name);
  }
  assert.equal(bookingTextForViewer(name, true), name);
  assert.equal(bookingTextForViewer(null, false), null);
  assert.equal(bookingTextForViewer(undefined, false), undefined);
});

test("calendar visitors see availability only, while owner/admin notes remain available", () => {
  const event = { date: "2026-09-20", status: "booked", note: "Private Ana test@example.com",
    eventType: "Nuntă +37369123456", startTime: "14:00", endTime: "00:00" };
  assert.deepEqual(calendarEventForViewer(event, false), { ...event, note: null, eventType: null });
  assert.equal(calendarEventForViewer(event, true), event);
  assert.equal(event.note, "Private Ana test@example.com", "projection never mutates stored content");
  const route = readFileSync("src/app/api/calendar/route.ts", "utf8");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(get, /let privileged = false/);
  assert.match(get, /user\.role === "admin" \|\| user\.role === "super_admin"/);
  assert.match(get, /privileged = owner\?\.userId === user\.id/);
  assert.match(get, /calendarEventForViewer\(e, privileged\)/);
  assert.match(get, /private, no-store/);
});

test("booking API and venue DTO gate all displayed free-text names before delivery", () => {
  const api = readFileSync("src/app/api/booking-requests/route.ts", "utf8");
  for (const key of ["clientName", "artistName", "venueName", "eventType", "message", "artistReply"]) {
    assert.match(api, new RegExp(`${key}: bookingTextForViewer\\(row\\.${key},`));
  }
  assert.match(api, /clientName: bookingTextForViewer\(row\.clientName, showContact\)/);
  assert.match(api, /nameRo: bookingTextForViewer\(linkedVenue\.nameRo, textShared\)/);
  const venue = readFileSync("src/lib/db/queries/venue-bookings.ts", "utf8");
  for (const key of ["clientName", "planTitle", "eventType", "message", "artistReply"]) {
    assert.match(venue, new RegExp(`${key}: bookingTextForViewer\\(r\\.${key}, canSeeContact\\)`));
  }
  assert.match(venue, /name: bookingTextForViewer\(artist\.name, canSeeContact\)/);
  const linkedQuery = venue.slice(venue.indexOf("const linkedRows"), venue.indexOf("for (const row of linkedRows)"));
  assert.doesNotMatch(linkedQuery, /"accepted"/);
});

test("both private iCal feeds and venue calendar sanitize the same client name and event label", () => {
  for (const path of ["src/app/api/calendar/ical/[artistId]/[token]/route.ts", "src/app/api/calendar/venue-ical/[venueId]/[token]/route.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /const clientName = bookingTextForViewer\(b\.clientName, shared\)/);
    assert.match(source, /const eventType = bookingTextForViewer\(b\.eventType, shared\)/);
    assert.doesNotMatch(source, /\$\{b\.clientName\}/);
    assert.match(source, /bookingTextForViewer\(b\.message, shared\)/);
  }
  const calendar = readFileSync("src/app/[locale]/(vendor)/dashboard/sala/calendar/page.tsx", "utf8");
  assert.match(calendar, /clientName: bookingTextForViewer\(booking\.clientName, contactsAreShared\(booking\.status\)\)/);
});

test("dashboard summaries and availability conflict messages do not reopen the name bypass", () => {
  for (const path of ["src/lib/db/queries/artist-dashboard.ts", "src/lib/db/queries/venue-stats.ts"]) {
    assert.match(readFileSync(path, "utf8"), /clientName: bookingTextForViewer\(/);
  }
  const availability = readFileSync("src/lib/booking/availability.ts", "utf8");
  assert.equal((availability.match(/clientName: bookingTextForViewer\(b\.clientName, false\)/g) ?? []).length, 2);
  const offers = visiblePriceOffers([{ from: "artist", amount: 300, at: "2026-09-07", message: "test&#64;example.com" }], "accepted")!;
  assert.equal(containsContact(offers[0].message!), false);
  assert.ok(!offers[0].message!.includes("&#64;"));
});
