import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  BOOKING_CLIENT_ERASURE,
  BOOKING_CREATION_IDENTITY_ERASURE,
  OFFER_REQUEST_CLIENT_ERASURE,
} from "../src/lib/privacy/account-erasure";

test("account erasure removes copied client contacts and free-form messages", () => {
  assert.deepEqual(BOOKING_CLIENT_ERASURE, {
    clientName: "(cont șters)",
    clientPhone: "",
    clientEmail: null,
    message: null,
    clientSignature: null,
    creationScopeHash: null,
    creationRequestId: null,
    creationPayloadHash: null,
  });
  assert.deepEqual(BOOKING_CREATION_IDENTITY_ERASURE, {
    creationScopeHash: null,
    creationRequestId: null,
    creationPayloadHash: null,
  });
  assert.deepEqual(OFFER_REQUEST_CLIENT_ERASURE, {
    clientName: "(cont șters)",
    clientPhone: "",
    clientEmail: null,
    message: null,
  });
});

test("both account deletion paths minimize linked and legacy offers before bookings", () => {
  for (const path of [
    "src/app/api/me/delete-account/route.ts",
    "src/app/api/webhooks/clerk/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    const offer = source.indexOf(".update(offerRequests)");
    const booking = source.indexOf(".update(bookingRequests)", offer);
    const user = source.indexOf(".delete(users)", booking);
    assert.ok(
      offer >= 0 && offer < booking && booking < user,
      `${path} must erase offer -> booking -> user inside its transaction`,
    );
    assert.match(source, /\.set\(OFFER_REQUEST_CLIENT_ERASURE\)/);
    assert.match(source, /bookingRequests\.clientUserId/);
    assert.match(source, /isNull\(offerRequests\.bookingRequestId\)/);
    assert.match(source, /offerRequests\.clientEmail/);
    assert.match(source, /offerRequests\.clientPhone/);
    assert.match(source, /scrubBookingEffectsForClientErasure\(/);
    assert.match(source, /scrubBookingEffectRecipientForErasure\(/);
    assert.match(source, /\.set\(BOOKING_CREATION_IDENTITY_ERASURE\)/);
    assert.match(source, /bookingRequests\.source, "manual"/);
    const legacyOffer = source.indexOf("const legacyOfferIdentity", offer);
    const outbox = source.indexOf(
      "scrubBookingEffectsForClientErasure(",
      legacyOffer,
    );
    const recipientOutbox = source.indexOf(
      "scrubBookingEffectRecipientForErasure(",
      outbox,
    );
    assert.ok(
      legacyOffer > offer && legacyOffer < booking,
      `${path} must scrub unlinked legacy CRM rows before bookings`,
    );
    assert.ok(
      outbox > legacyOffer && outbox < booking,
      `${path} must scrub durable create payloads before bookings`,
    );
    assert.ok(
      recipientOutbox > outbox && recipientOutbox < booking,
      `${path} must scrub the deleted account as an outbox recipient`,
    );
  }
});

test("booking outbox erasure cancels work and replaces immutable payload PII", () => {
  const source = readFileSync("src/lib/booking/effect-outbox.ts", "utf8");
  const start = source.indexOf(
    "export async function scrubBookingEffectsForClientErasure",
  );
  const end = source.indexOf("Invalidates every confirmation delivery", start);
  assert.ok(start >= 0 && end > start);
  const helper = source.slice(start, end);
  assert.match(helper, /BOOKING_CREATION_NOTIFICATION_EFFECT/);
  assert.match(helper, /CONFIRMATION_NOTIFICATION_EFFECT/);
  assert.match(helper, /scrubPersistedBookingNotificationsForErasure/);
  assert.match(helper, /\.for\("update"\)/);
  assert.match(helper, /jsonb_build_object\(/);
  assert.match(helper, /'type', 'booking_erased'/);
  assert.match(helper, /recipientUserId: sql`md5/);
  assert.match(helper, /THEN 'cancelled'/);
  assert.match(helper, /scrubBookingEffectRecipientForErasure/);
  assert.match(helper, /bookingEffectDeliveries\.recipientUserId, userId/);
  assert.ok(
    helper.lastIndexOf("scrubPersistedBookingNotificationsForErasure")
      > helper.indexOf(".update(bookingEffectOutbox)"),
    "persisted notifications must be scrubbed after child/coordinator delivery settles",
  );
});

test("Clerk deletion also deactivates orphanable vendor profiles", () => {
  const source = readFileSync("src/app/api/webhooks/clerk/route.ts", "utf8");
  const transaction = source.indexOf("const deactivated = await db.transaction");
  const artist = source.indexOf(".update(artists)", transaction);
  const venue = source.indexOf(".update(venues)", artist);
  const user = source.indexOf(".delete(users)", venue);
  const refresh = source.indexOf('revalidateVendorCatalog("artist"', user);
  assert.ok(transaction >= 0 && transaction < artist && artist < venue && venue < user);
  assert.ok(user < refresh, "catalog cache refresh must follow the committed erasure");
  assert.match(source, /isActive: false/);
  assert.match(source, /nameRo: "Profil dezactivat"/);
  assert.match(source, /tx\.delete\(artistImages\)/);
  assert.match(source, /tx\.delete\(artistVideos\)/);
  assert.match(source, /tx\.delete\(venueImages\)/);
});
