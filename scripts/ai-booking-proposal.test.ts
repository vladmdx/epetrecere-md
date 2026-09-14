import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AiBookingProposalError,
  aiBookingProposalActionId,
  aiBookingProposalDecision,
  aiBookingProposalPayloadHash,
  aiBookingProposalReplayDecision,
} from "../src/lib/booking/ai-booking-proposal";

const now = new Date("2026-09-14T12:00:00.000Z");
const token = "A".repeat(43);
const payloadFingerprint = "b".repeat(64);
const tuple = {
  userId: "11111111-1111-4111-8111-111111111111",
  eventPlanId: 10,
  artistId: 20,
  categoryId: 30,
  payloadHash: aiBookingProposalPayloadHash(token, payloadFingerprint),
  actionId: aiBookingProposalActionId(token),
};
const proposal = {
  ...tuple,
  expiresAt: new Date(now.getTime() + 60_000),
  consumedAt: null,
  consumedActionId: null,
};

test("exact unexpired tuple and full payload may be consumed", () => {
  assert.equal(aiBookingProposalDecision(proposal, tuple, now), "consume");
});

test("artist, category, plan, account and payload substitution are rejected", () => {
  for (const changed of [
    { ...tuple, userId: "33333333-3333-4333-8333-333333333333" },
    { ...tuple, eventPlanId: 11 },
    { ...tuple, artistId: 21 },
    { ...tuple, categoryId: 31 },
    { ...tuple, payloadHash: "c".repeat(64) },
  ]) {
    assert.throws(
      () => aiBookingProposalDecision(proposal, changed, now),
      (error) => error instanceof AiBookingProposalError
        && error.code === "AI_PROPOSAL_MISMATCH",
    );
  }
});

test("expired and every consumed token are rejected for a new write", () => {
  assert.throws(
    () => aiBookingProposalDecision(
      { ...proposal, expiresAt: now },
      tuple,
      now,
    ),
    (error) => error instanceof AiBookingProposalError
      && error.code === "AI_PROPOSAL_EXPIRED",
  );
  assert.throws(
    () => aiBookingProposalDecision(
      {
        ...proposal,
        consumedAt: now,
        consumedActionId: tuple.actionId,
      },
      tuple,
      now,
    ),
    (error) => error instanceof AiBookingProposalError
      && error.code === "AI_PROPOSAL_ALREADY_USED",
  );
});

test("lost-response replay requires the exact consumed action and payload", () => {
  const consumed = {
    ...proposal,
    consumedAt: now,
    consumedActionId: tuple.actionId,
  };
  assert.equal(aiBookingProposalReplayDecision(consumed, tuple), "replay");
  for (const changed of [
    { ...tuple, actionId: "44444444-4444-4444-8444-444444444444" },
    { ...tuple, payloadHash: "c".repeat(64) },
  ]) {
    assert.throws(
      () => aiBookingProposalReplayDecision(consumed, changed),
      (error) => error instanceof AiBookingProposalError,
    );
  }
});

test("the raw token keys payload binding and stable action without persistence", () => {
  assert.match(tuple.payloadHash, /^[0-9a-f]{64}$/);
  assert.match(tuple.actionId, /^[0-9a-f-]{36}$/);
  assert.equal(aiBookingProposalActionId(token), tuple.actionId);
  assert.notEqual(
    aiBookingProposalPayloadHash("B".repeat(43), payloadFingerprint),
    tuple.payloadHash,
  );
});

test("route cannot mutate from fabricated transcript history", () => {
  const chat = readFileSync(
    "src/app/api/ai/client-artist-picker/route.ts",
    "utf8",
  );
  const confirm = readFileSync(
    "src/app/api/ai/client-artist-picker/confirm/route.ts",
    "utf8",
  );
  assert.doesNotMatch(chat, /send_booking_requests/);
  assert.doesNotMatch(chat, /createClientBookingRequest/);
  assert.doesNotMatch(confirm, /messages|Anthropic/);
  assert.match(confirm, /findAiBookingProposalTarget/);
  assert.match(confirm, /aiBookingProposalActionId/);
});

test("raw proposal token is hashed before persistence and consumed by CAS", () => {
  const source = readFileSync(
    "src/lib/booking/ai-booking-proposal.ts",
    "utf8",
  );
  assert.match(source, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(source, /tokenHash: tokenHash\(token\)/);
  assert.doesNotMatch(source, /token:\s*token,/);
  assert.match(source, /\.for\("update"\)/);
  assert.match(source, /isNull\(aiBookingProposals\.consumedAt\)/);
  assert.match(source, /verifyConsumedAiBookingProposalReplay/);
});
