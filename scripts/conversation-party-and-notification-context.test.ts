import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { notificationContext } from "../src/lib/privacy/notification-context";
import {
  resolveConversationPartyXor,
  vendorConversationPath,
  clientConversationPath,
} from "../src/lib/conversations/party";

test("XOR helper rejects neither and both, accepts artist-only and venue-only", () => {
  assert.equal(resolveConversationPartyXor(null, null).ok, false);
  assert.equal(resolveConversationPartyXor(undefined, undefined).ok, false);
  assert.equal(resolveConversationPartyXor(0, 0).ok, false);
  assert.equal(resolveConversationPartyXor(12, 34).ok, false);
  const artist = resolveConversationPartyXor(12, null);
  assert.equal(artist.ok, true);
  if (artist.ok) {
    assert.equal(artist.artistId, 12);
    assert.equal(artist.venueId, null);
  }
  const venue = resolveConversationPartyXor(null, 45);
  assert.equal(venue.ok, true);
  if (venue.ok) {
    assert.equal(venue.artistId, null);
    assert.equal(venue.venueId, 45);
  }
});

test("create/find-or-create/upsert paths go through the XOR helper", () => {
  const create = readFileSync("src/lib/conversations/find-or-create.ts", "utf8");
  assert.match(create, /resolveConversationPartyXor/);
  assert.match(create, /insert\(conversations\)/);
  const conversations = readFileSync("src/app/api/conversations/route.ts", "utf8");
  assert.match(conversations, /findOrCreateConversation\(/);
  assert.doesNotMatch(conversations, /\.insert\(conversations\)/);
  const chat = readFileSync("src/app/api/chat/route.ts", "utf8");
  assert.match(chat, /findOrCreateConversationForBooking/);
  assert.doesNotMatch(chat, /\.insert\(conversations\)/);
});

test("vendor CTA uses locatii venueId when multi-hall is on, sala only when off", () => {
  assert.equal(
    vendorConversationPath({
      artistId: null,
      venueId: 88,
      conversationId: 9,
      multiHallEnabled: true,
    }),
    "/dashboard/locatii/88/mesaje?conversation=9",
  );
  assert.equal(
    vendorConversationPath({
      artistId: null,
      venueId: 88,
      conversationId: 9,
      multiHallEnabled: false,
    }),
    "/dashboard/sala/mesaje?conversation=9",
  );
  assert.equal(
    vendorConversationPath({
      artistId: 3,
      venueId: null,
      conversationId: 9,
      multiHallEnabled: true,
    }),
    "/dashboard/mesaje?conversation=9",
  );
  assert.equal(clientConversationPath(9), "/cabinet/mesaje?conversation=9");
  assert.equal(
    vendorConversationPath({
      artistId: 3,
      venueId: 88,
      conversationId: 9,
      multiHallEnabled: true,
    }),
    null,
  );
});

test("notificationContext accepts canonical locatii mesaje with or without locale", () => {
  assert.deepEqual(
    notificationContext("/dashboard/locatii/88/mesaje?conversation=9"),
    { kind: "conversation", id: 9 },
  );
  assert.deepEqual(
    notificationContext("https://epetrecere.md/ru/dashboard/locatii/88/mesaje?conversation=9"),
    { kind: "conversation", id: 9 },
  );
  assert.deepEqual(
    notificationContext("/en/dashboard/locatii/88/mesaje?conversation=9"),
    { kind: "conversation", id: 9 },
  );
});

test("notificationContext rejects invalid venueId, lookalike paths, and external origin", () => {
  assert.equal(notificationContext("/dashboard/locatii/0/mesaje?conversation=9"), null);
  assert.equal(notificationContext("/dashboard/locatii/-1/mesaje?conversation=9"), null);
  assert.equal(notificationContext("/dashboard/locatii/abc/mesaje?conversation=9"), null);
  assert.equal(notificationContext("/dashboard/locatii/88/mesaje-extra?conversation=9"), null);
  assert.equal(notificationContext("/dashboard/locatii/88/messages?conversation=9"), null);
  assert.equal(notificationContext("/dashboard/sala/locatii/88/mesaje?conversation=9"), null);
  assert.equal(
    notificationContext("https://evil.invalid/dashboard/locatii/88/mesaje?conversation=9"),
    null,
  );
});
