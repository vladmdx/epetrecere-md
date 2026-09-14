import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  BookingRequestCreateSchema,
  isValidBookingPhone,
} from "../packages/shared/src/validators/index";
import {
  InvalidJsonRequestError,
  readBoundedJson,
  RequestBodyTooLargeError,
} from "../src/lib/http/read-bounded-json";

const valid = {
  artistId: 7,
  clientName: "  Client Exemplu  ",
  clientPhone: "+373 (60) 123-456",
  clientEmail: " CLIENT@Example.Invalid ",
  eventDate: "2032-02-29",
  startTime: "09:05",
  eventType: "wedding",
  guestCount: 120,
  message: "  Detalii  ",
  agreedPrice: 900,
};

test("canonical booking schema normalizes bounded contact fields", () => {
  const parsed = BookingRequestCreateSchema.parse(valid);
  assert.equal(parsed.clientName, "Client Exemplu");
  assert.equal(parsed.clientPhone, "+37360123456");
  assert.equal(parsed.clientEmail, "client@example.invalid");
  assert.equal(parsed.message, "Detalii");
  assert.equal(isValidBookingPhone(parsed.clientPhone), true);
});

test("canonical booking schema rejects malformed or abusive fields", () => {
  for (const clientPhone of ["123", "+37300000000", "+373abc123456", "+1234567890123456"]) {
    assert.equal(
      BookingRequestCreateSchema.safeParse({ ...valid, clientPhone }).success,
      false,
      clientPhone,
    );
  }
  for (const bad of [
    { clientName: "x" },
    { clientName: "x".repeat(101) },
    { clientEmail: `${"a".repeat(250)}@example.invalid` },
    { eventDate: "2031-02-29" },
    { startTime: "9:05" },
    { eventType: "custom-unbounded" },
    { guestCount: 10_001 },
    { message: "x".repeat(2_001) },
    { agreedPrice: 10_000_001 },
    { venueId: 8 },
    { unexpected: true },
  ]) {
    assert.equal(
      BookingRequestCreateSchema.safeParse({ ...valid, ...bad }).success,
      false,
      JSON.stringify(bad),
    );
  }
});

test("bounded JSON reader rejects declared and streamed overflow", async () => {
  await assert.rejects(
    readBoundedJson(new Request("https://example.invalid", {
      method: "POST",
      headers: { "Content-Length": "101" },
      body: "{}",
    }), 100),
    RequestBodyTooLargeError,
  );
  await assert.rejects(
    readBoundedJson(new Request("https://example.invalid", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(100) }),
    }), 32),
    RequestBodyTooLargeError,
  );
});

test("bounded JSON reader parses valid bodies and rejects invalid JSON", async () => {
  assert.deepEqual(
    await readBoundedJson(new Request("https://example.invalid", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    }), 128),
    { ok: true },
  );
  await assert.rejects(
    readBoundedJson(new Request("https://example.invalid", {
      method: "POST",
      body: "{",
    }), 128),
    InvalidJsonRequestError,
  );
});

test("web and mobile share validation while mobile preserves explicit phone edits", () => {
  const route = readFileSync("src/app/api/booking-requests/route.ts", "utf8");
  assert.match(route, /const bookingSchema = BookingRequestCreateSchema/);
  assert.match(route, /readBoundedJson\(req, BOOKING_REQUEST_MAX_BODY_BYTES\)/);
  assert.match(route, /status: 413/);

  const service = readFileSync("src/lib/booking/client-booking-create.ts", "utf8");
  assert.match(service, /clientPhone: normalizeBookingPhone\(input\.booking\.clientPhone\)/);
  assert.doesNotMatch(service, /clientPhone: actor\?\.phone/);

  const idempotency = readFileSync(
    "src/lib/booking/booking-create-idempotency.ts",
    "utf8",
  );
  const managed = idempotency.slice(idempotency.indexOf("serverManagedClientIdentity"));
  assert.doesNotMatch(managed, /clientPhone: SERVER_MANAGED_IDENTITY/);

  const mobile = readFileSync(
    "packages/mobile/app/(client)/booking-new.tsx",
    "utf8",
  );
  assert.match(mobile, /user\?\.primaryPhoneNumber\?\.phoneNumber/);
  assert.doesNotMatch(mobile, /phoneNumbers\?\.\[0\]/);
  assert.match(mobile, /const phoneEdited = useRef\(false\)/);
  assert.match(mobile, /isLoaded && clerkPhone && !phoneEdited\.current/);
  assert.match(mobile, /phoneEdited\.current = true/);
  assert.match(mobile, /clientPhone: phone\.trim\(\)/);
  assert.equal(
    mobile.match(/const cleared = await clearPendingJsonRequest/g)?.length,
    2,
  );
  assert.equal(mobile.match(/if \(!cleared\)/g)?.length, 2);
  assert.ok(
    mobile.indexOf("if (!cleared)", mobile.indexOf("if (!res.ok)"))
      < mobile.indexOf("return data as { id: number }"),
  );
});
