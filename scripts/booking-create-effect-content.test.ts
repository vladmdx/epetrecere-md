import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingAdminNotificationMessage,
  bookingAutoReplyEmailHtml,
} from "../src/lib/booking/booking-create-effect-content";

const malicious = `<img src=x onerror="boom">&'\/`;

test("admin booking e-mail escapes every dynamic field", () => {
  const html = bookingAdminNotificationMessage({
    clientName: malicious,
    partnerName: malicious,
    eventType: malicious,
    eventDate: malicious,
    startTime: malicious,
    endTime: malicious,
  });

  assert.doesNotMatch(html, /<img|onerror="boom"/);
  assert.match(html, /&lt;img/);
  assert.equal((html.match(/&lt;img/g) ?? []).length, 6);
  assert.match(html, /&quot;boom&quot;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&#x27;/);
});

test("auto-reply keeps only template markup and preserves escaped newlines", () => {
  const html = bookingAutoReplyEmailHtml({
    clientName: malicious,
    partnerName: malicious,
    autoReplyMessage: `${malicious}\n<script>alert(1)</script>`,
    eventDate: malicious,
  });

  assert.doesNotMatch(html, /<img|<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;&#x2F;script&gt;/);
  assert.match(html, /<br\/>/);
  assert.equal((html.match(/&lt;img/g) ?? []).length, 4);
});
