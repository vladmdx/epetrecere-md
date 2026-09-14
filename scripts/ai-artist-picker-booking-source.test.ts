import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const chatRoute = read("src/app/api/ai/client-artist-picker/route.ts");
const confirmRoute = read(
  "src/app/api/ai/client-artist-picker/confirm/route.ts",
);
const writer = read("src/lib/booking/client-booking-create.ts");
const proposal = read("src/lib/booking/ai-booking-proposal.ts");
const component = read("src/components/planner/ai-artist-picker-chat.tsx");

const checks: Array<[string, boolean]> = [
  [
    "the LLM route has no mutating send tool or booking writer",
    !chatRoute.includes('name: "send_booking_requests"')
      && !chatRoute.includes("createClientBookingRequest({")
      && !chatRoute.includes("hasExplicitAiBookingConfirmation"),
  ],
  [
    "the LLM only prepares exact server proposals",
    chatRoute.includes('name: "prepare_booking_request"')
      && chatRoute.includes("issueAiBookingProposal({")
      && chatRoute.includes("payloadFingerprint: aiBookingPayloadFingerprint"),
  ],
  [
    "raw proposal tokens are excluded from model tool results",
    chatRoute.includes("pendingProposals.push({")
      && !/toolResult = JSON\.stringify\(\{[\s\S]{0,500}proposalToken: proposal\.token/.test(
        chatRoute,
      ),
  ],
  [
    "the browser receives a separate server-controlled pending proposal",
    chatRoute.includes("pendingProposals,")
      && component.includes("pendingProposals.map((proposal)")
      && component.includes('fetch("/api/ai/client-artist-picker/confirm"'),
  ],
  [
    "only the direct authenticated endpoint performs the mutation",
    confirmRoute.includes("findAiBookingProposalTarget({")
      && confirmRoute.includes("createClientBookingRequest({")
      && confirmRoute.includes("aiBookingProposalActionId(")
      && confirmRoute.includes("dispatchBookingCreationEffects(creation)"),
  ],
  [
    "the direct endpoint ignores all transcript content",
    !confirmRoute.includes("messages")
      && !confirmRoute.includes("assistant")
      && !confirmRoute.includes("Anthropic"),
  ],
  [
    "proposal consumption binds the full payload and exact tuple",
    proposal.includes("aiBookingProposalPayloadHash(")
      && proposal.includes("payloadFingerprint")
      && writer.includes("proposalPayloadFingerprint")
      && writer.includes("buildAiBookingPayload({"),
  ],
  [
    "new creates reject consumed tokens while lost-response replays reauthorize",
    proposal.includes('throw new AiBookingProposalError("AI_PROPOSAL_ALREADY_USED")')
      && proposal.includes("verifyConsumedAiBookingProposalReplay")
      && writer.includes("authorizeReplay:"),
  ],
  [
    "chat input is strictly capped and contains text only",
    chatRoute.includes("const requestSchema = z")
      && chatRoute.includes("z.string().min(1).max(4_000)")
      && chatRoute.includes(".max(30)")
      && chatRoute.includes("Message roles must alternate."),
  ],
  [
    "artist discovery and prepare expose only active profiles/categories",
    chatRoute.includes("eq(artists.isActive, true)")
      && chatRoute.includes(".where(eq(categories.isActive, true))"),
  ],
  [
    "tool filters are strict, finite and bounded before reaching queries",
    chatRoute.includes("listAvailableArtistsInputSchema.safeParse(")
      && chatRoute.includes("z.number().finite().nonnegative().max(10_000_000)")
      && chatRoute.includes("z.number().finite().min(0).max(5)")
      && chatRoute.includes(".max(20)")
      && chatRoute.includes('code: "INVALID_ARTIST_FILTERS"'),
  ],
  [
    "prepare accepts only artist/category pairs returned in this execution",
    chatRoute.includes("const availableArtistCategoryPairs = new Set<string>()")
      && chatRoute.includes("availableArtistCategoryPairs.add(`${a.id}:${categoryId}`)")
      && chatRoute.includes("availableArtistCategoryPairs.has(`${artistId}:${categoryId}`)")
      && chatRoute.indexOf("!pairWasReturned")
        < chatRoute.indexOf("issueAiBookingProposal({"),
  ],
  [
    "invalid profile phone blocks proposal issuance with a deterministic notice",
    chatRoute.includes("function hasBookableProfilePhone(")
      && chatRoute.includes("phoneDigits.length >= 8")
      && chatRoute.includes("!hasBookableProfilePhone(appUser.phone)")
      && chatRoute.includes('code: "CLIENT_PHONE_REQUIRED"')
      && chatRoute.indexOf("!hasBookableProfilePhone(appUser.phone)")
        < chatRoute.indexOf("issueAiBookingProposal({"),
  ],
  [
    "pending cards contain only masked contacts plus the canonical message",
    chatRoute.includes("contactEmailMasked: maskEmail(")
      && chatRoute.includes("contactPhoneMasked: maskPhone(")
      && chatRoute.includes("message: bookingPayload.message")
      && component.includes("proposal.contactEmailMasked")
      && component.includes("proposal.contactPhoneMasked")
      && component.includes("proposal.message"),
  ],
  [
    "confirmation cards expire client-side and preserve retryable failures",
    component.includes("proposalSecondsRemaining(")
      && component.includes("|| (isExpired && !isRecovery)")
      && component.includes("TERMINAL_CONFIRM_CODES.has(result.code)")
      && !component.includes("if (res.status < 500)"),
  ],
  [
    "confirmation logging emits only a correlation id, safe class and allowlisted code",
    confirmRoute.includes("const SAFE_CONFIRM_ERROR_CODES = new Set(")
      && confirmRoute.includes("safeConfirmErrorLog(error, correlationId)")
      && confirmRoute.includes("errorClass: safeErrorClass(error)")
      && confirmRoute.includes('"X-Correlation-Id": correlationId')
      && !confirmRoute.includes('console.error("[ai/client-artist-picker/confirm] failed", error)'),
  ],
  [
    "the UI has no legacy send-booking tool reference",
    !component.includes("send_booking_requests")
      && component.includes('tc.name === "prepare_booking_request"'),
  ],
];

for (const [name, ok] of checks) {
  assert.equal(ok, true, name);
  console.log(`ok - ${name}`);
}

console.log(`${checks.length}/${checks.length} AI artist-picker source checks passed`);
