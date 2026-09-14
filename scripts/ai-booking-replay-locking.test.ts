import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  aiBookingPayloadFingerprint,
  aiBookingPayloadFingerprintFromPersistedBooking,
  buildAiBookingPayload,
} from "../src/lib/booking/ai-booking-payload";

test("lost-response replay binds the committed AI booking, not mutable current profile data", () => {
  const original = buildAiBookingPayload({
    plan: {
      id: 17,
      title: "Nunta Ana și Ion",
      eventType: "wedding",
      eventDate: "2026-10-21",
      guestCountTarget: 120,
    },
    actor: {
      name: "Ana Client",
      email: "ana@example.test",
      phone: "+37360000000",
    },
    artistId: 29,
  });
  assert.ok(original);

  const persisted = {
    artistId: original.artistId,
    venueId: null,
    eventPlanId: original.eventPlanId,
    hallId: null,
    reservationScope: null,
    clientUserId: "11111111-1111-4111-8111-111111111111",
    clientName: original.clientName,
    clientPhone: original.clientPhone,
    clientEmail: original.clientEmail ?? null,
    eventDate: original.eventDate,
    startTime: null,
    endTime: null,
    eventType: original.eventType ?? null,
    guestCount: original.guestCount ?? null,
    message: original.message,
    agreedPrice: null,
  } as const;

  assert.equal(
    aiBookingPayloadFingerprintFromPersistedBooking(persisted),
    aiBookingPayloadFingerprint(original),
  );

  const changed = buildAiBookingPayload({
    plan: {
      id: 17,
      title: "Titlu schimbat",
      eventType: "birthday",
      eventDate: "2026-11-02",
      guestCountTarget: 40,
    },
    actor: {
      name: "Nume schimbat",
      email: "nou@example.test",
      phone: "+37361111111",
    },
    artistId: 29,
  });
  assert.ok(changed);
  assert.notEqual(
    aiBookingPayloadFingerprint(changed),
    aiBookingPayloadFingerprintFromPersistedBooking(persisted),
  );
});

test("an ambiguous browser send survives expiry and tab reload for replay only", () => {
  const ui = readFileSync(
    "src/components/planner/ai-artist-picker-chat.tsx",
    "utf8",
  );
  const remember = ui.indexOf("rememberRecoveryToken(proposalToken)");
  const request = ui.indexOf('fetch("/api/ai/client-artist-picker/confirm"', remember);
  assert.ok(remember >= 0 && remember < request, "persist before network I/O");
  assert.match(ui, /window\.sessionStorage\.setItem/);
  assert.match(
    ui,
    /proposalSecondsRemaining\(expiresAt, Date\.now\(\)\) === 0[\s\S]*&& !isRecovery/,
  );
  assert.match(
    ui,
    /const terminalFailure = typeof result\.code === "string"[\s\S]*if \(terminalFailure\) \{[\s\S]*forgetRecoveryToken\(proposalToken\)/,
  );
  assert.doesNotMatch(
    ui,
    /res\.status < 500[\s\S]*forgetRecoveryToken\(proposalToken\)/,
  );
  assert.match(ui, /onClick=\{\(\) => void confirmProposalToken\(token\)\}/);
});

test("new AI confirmation locks parents before consuming the proposal child", () => {
  const writer = readFileSync(
    "src/lib/booking/client-booking-create.ts",
    "utf8",
  );
  const conflict = writer.indexOf("findArtistPlanBookingConflict(");
  const target = writer.indexOf("const [targetArtist]", conflict);
  const category = writer.indexOf("const [requiredCategory]", target);
  const consume = writer.indexOf("await consumeAiBookingProposal(", category);
  const insert = writer.indexOf(".insert(bookingRequests)", consume);
  assert.ok(
    conflict >= 0
      && target > conflict
      && category > target
      && consume > category
      && insert > consume,
    "required order: artist set -> target -> category -> proposal -> booking",
  );

  const proposal = readFileSync(
    "src/lib/booking/ai-booking-proposal.ts",
    "utf8",
  );
  const cleanup = proposal.indexOf("await db.execute(sql`");
  const issue = proposal.indexOf("await db.insert(aiBookingProposals)", cleanup);
  assert.ok(cleanup >= 0 && issue > cleanup);
  const between = proposal.slice(cleanup, issue);
  assert.doesNotMatch(
    between,
    /db\.transaction/,
    "expired-child cleanup must commit before the FK-bearing proposal insert",
  );
});

test("AI replay can bypass only the generic mutable-payload mismatch after exact nonce proof", () => {
  const wrapper = readFileSync(
    "src/lib/booking/booking-request-write.ts",
    "utf8",
  );
  const authorization = wrapper.indexOf(
    "const replayAuthorization = await options.authorizeReplay",
  );
  const comparison = wrapper.indexOf(
    "existing.creationPayloadHash !== prepared.payloadHash",
    authorization,
  );
  assert.ok(authorization >= 0 && comparison > authorization);
  assert.match(wrapper, /replayAuthorization !== "allow_payload_mismatch"/);

  const proposal = readFileSync(
    "src/lib/booking/ai-booking-proposal.ts",
    "utf8",
  );
  assert.match(proposal, /aiBookingPayloadFingerprintFromPersistedBooking/);
  assert.match(proposal, /input\.booking\.clientUserId !== input\.userId/);
  assert.match(proposal, /input\.booking\.eventPlanId !== input\.eventPlanId/);
  assert.match(proposal, /input\.booking\.artistId !== input\.artistId/);
});
