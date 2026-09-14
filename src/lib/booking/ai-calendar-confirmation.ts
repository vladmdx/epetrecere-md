import { isValidCalendarDate } from "@/lib/booking/calendar-input-validation";

export type AiCalendarConversationMessage = Readonly<{
  role: "user" | "assistant";
  content: unknown;
}>;

export type AiCalendarBlockRequest = Readonly<{
  fromDate: string;
  toDate: string;
}>;

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (
        block
        && typeof block === "object"
        && "type" in block
        && block.type === "text"
        && "text" in block
        && typeof block.text === "string"
      ) {
        return block.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const NEGATION =
  /(?:^|[\s,;.!?])(?:nu|fara|anuleaza|anulare|stop|no|not|don't|do not|cancel|never|нет|не|отмена|стоп)(?:$|[\s,;.!?])/iu;
const AFFIRMATIVE =
  /^(?:da|da,?\s+confirm|confirm|confirma|confirm blocarea|confirma blocarea|sunt de acord|ok(?:ay)?|poti bloca|blocheaza|da,?\s+blocheaza|yes|yes,?\s+confirm|i confirm|go ahead|yes,?\s+block (?:it|those dates|the dates)|block (?:it|those dates|the dates)|да|да,?\s+подтверждаю|подтверждаю|можно|заблокируй|да,?\s+заблокируй)[.!\s]*$/iu;
const BLOCK_CONTEXT =
  /(?:bloc(?:hez|are|area|a|at)|block(?:ing|ed)?|заблокир|блокиров)/iu;
const UNBLOCK_CONTEXT =
  /(?:debloc\p{L}*|unblock\p{L}*|разблокир\p{L}*)/iu;
const CONFIRMATION_CONTEXT =
  /(?:vrei|confirm|esti de acord|pot sa|shall i|should i|do you confirm|are you sure|подтверд|можно|соглас)/iu;

/**
 * Authorization guard for the venue assistant's calendar mutation.
 *
 * The model prompt is guidance, not authority. The immediately preceding
 * assistant turn must ask for confirmation of this exact ISO date range, and
 * the final user turn must be a short standalone approval. Negative,
 * compound, ambiguous, stale and range-mismatched answers fail closed.
 */
export function hasExplicitAiCalendarBlockConfirmation(
  messages: readonly AiCalendarConversationMessage[],
  request: AiCalendarBlockRequest,
): boolean {
  if (
    !isValidCalendarDate(request.fromDate)
    || !isValidCalendarDate(request.toDate)
    || request.toDate < request.fromDate
  ) {
    return false;
  }
  if (messages.length < 2) return false;
  const approvalTurn = messages[messages.length - 1];
  const proposalTurn = messages[messages.length - 2];
  if (approvalTurn?.role !== "user" || proposalTurn?.role !== "assistant") {
    return false;
  }

  const approval = normalizedText(contentText(approvalTurn.content));
  if (!approval || approval.length > 100 || NEGATION.test(approval)) return false;
  if (!AFFIRMATIVE.test(approval)) return false;

  const proposalRaw = contentText(proposalTurn.content);
  const proposal = normalizedText(proposalRaw);
  if (
    !proposal
    || NEGATION.test(proposal)
    || UNBLOCK_CONTEXT.test(proposal)
    || !BLOCK_CONTEXT.test(proposal)
    || !CONFIRMATION_CONTEXT.test(proposal)
  ) {
    return false;
  }

  const proposalDates = proposalRaw.match(
    /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g,
  ) ?? [];
  const expectedDates = request.fromDate === request.toDate
    ? [request.fromDate]
    : [request.fromDate, request.toDate];
  return proposalDates.length === expectedDates.length
    && proposalDates.every((date, index) => date === expectedDates[index]);
}
