import assert from "node:assert/strict";
import { test } from "node:test";
import { containsContact, redactContact } from "../src/lib/privacy/contact-redaction";

for (const value of [
  "Evenimentul este pe 20.09.2026 la 14:00",
  "Event date 2026-09-20",
  "Дата события: 20.09.2026.",
  "29.02.2028", "2028-02-29", "31-12-2026", "2026.09.20",
  "20.09.2026 14:00", "2026-09-20 9:05", "2026-09-20 23:59",
  "Data 20/09/2026", "20.09.2026, 60 invitați, 300 EUR",
]) {
  test(`valid event date remains sendable and unchanged: ${value}`, () => {
    assert.equal(containsContact(value), false);
    assert.equal(redactContact(value), value);
  });
}

for (const value of [
  "29.02.2026", "2026-02-29", "31.09.2026", "00.09.2026", "2026-13-20",
  "20.09-2026", "0700-12-31", "2026-09-20 25:00", "2026-09-20 14:60",
  "069123456", "+373 69 123 456", "+373 (69) 123-456", "+12025550123",
  "+373+69+123+456", "+3+7+3+6+9+1+2+3+4+5+6", "06+91+23+456", "+(20.09.2026)",
  "+373 20.09.2026", "+20.09.2026", "120.09.2026", "20.09.20260",
  "(20)09.2026", "2026-09-20 069123456", "x2026-09-20", "2026-09-20x",
  "+３７３ ６９ １２３ ４５６", "069\u200b123456",
]) {
  test(`invalid date or phone is still blocked: ${value}`, () => {
    assert.equal(containsContact(value), true);
    assert.match(redactContact(value), /\[telefon disponibil după confirmare\]/);
  });
}

test("a valid date does not unlock neighboring contacts, links, handles or encoded phones", () => {
  for (const contact of ["qa@example.invalid", "+373 69 123 456", "https://example.md", "@qa_contact"]) {
    const value = `20.09.2026. Contact: ${contact}`;
    assert.equal(containsContact(value), true);
    assert.ok(redactContact(value).startsWith("20.09.2026. Contact: "));
    assert.ok(!redactContact(value).includes(contact));
  }
});

test("repeated scans do not leak mutable regex state and redaction preserves sentence spacing", () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(containsContact("20.09.2026 la 14:00"), false);
    assert.equal(containsContact("Telefon 069123456 apoi discutăm"), true);
    assert.equal(redactContact("Telefon 069123456 apoi discutăm"), "Telefon [telefon disponibil după confirmare] apoi discutăm");
  }
});
