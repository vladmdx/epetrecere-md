/**
 * Rejects filler text in partner-facing fields.
 *
 * A deliberate copy of `src/lib/validation/text-quality.ts` on the web side.
 * The web app does not depend on this package — wiring it in would mean
 * touching a production build that has been difficult to keep green — so the
 * rules live in two files that must change together. They are short and
 * stable enough for that to be the cheaper trade, but if one is edited the
 * other has to follow, or the app will disable a button the server would have
 * accepted, or worse, allow one it rejects.
 *
 * The point of running them here at all: the server answers a bad name with
 * `name_not_substantive`, which is not something to show a partner. Checking
 * on the phone means they see which field is wrong, while they are still in
 * it.
 */

export type TextIssue =
  | "too_short"
  | "too_long"
  | "no_letters"
  | "too_few_distinct"
  | "too_few_words";

export interface TextCheck {
  ok: boolean;
  issue?: TextIssue;
}

const OK: TextCheck = { ok: true };
const fail = (issue: TextIssue): TextCheck => ({ ok: false, issue });

/** Distinct characters, ignoring case and whitespace. "kk" → 1, "aaa" → 1. */
function distinctChars(v: string): number {
  return new Set(v.toLowerCase().replace(/\s/gu, "")).size;
}

function hasLetter(v: string): boolean {
  return /\p{L}/u.test(v);
}

export const NAME_MIN = 3;
export const NAME_MAX = 80;
export const DESCRIPTION_MIN = 40;
export const DESCRIPTION_MAX = 2000;

export function checkName(raw: string): TextCheck {
  const v = raw.trim();
  if (v.length < NAME_MIN) return fail("too_short");
  if (v.length > NAME_MAX) return fail("too_long");
  if (!hasLetter(v)) return fail("no_letters");
  if (distinctChars(v) < 2) return fail("too_few_distinct");
  return OK;
}

export function checkDescription(raw: string | null | undefined): TextCheck {
  const v = (raw ?? "").trim();
  if (v.length === 0) return OK;
  if (v.length < DESCRIPTION_MIN) return fail("too_short");
  if (v.length > DESCRIPTION_MAX) return fail("too_long");
  if (!hasLetter(v)) return fail("no_letters");
  if (distinctChars(v) < 10) return fail("too_few_distinct");
  if (v.split(/\s+/u).filter(Boolean).length < 5) return fail("too_few_words");
  return OK;
}

/** Romanian message for a failed check, ready to put under a field. */
export function textIssueMessage(
  field: "name" | "description",
  issue: TextIssue,
): string {
  if (field === "name") {
    switch (issue) {
      case "too_short":
        return `Numele trebuie să aibă cel puțin ${NAME_MIN} caractere.`;
      case "too_long":
        return `Numele e prea lung (maximum ${NAME_MAX} caractere).`;
      case "no_letters":
        return "Numele trebuie să conțină litere.";
      default:
        return "Scrie numele real sub care te prezinți.";
    }
  }
  switch (issue) {
    case "too_short":
      return `Descrierea trebuie să aibă cel puțin ${DESCRIPTION_MIN} caractere.`;
    case "too_long":
      return `Descrierea e prea lungă (maximum ${DESCRIPTION_MAX} caractere).`;
    case "no_letters":
      return "Descrierea trebuie să conțină litere.";
    case "too_few_words":
      return "Scrie cel puțin o propoziție despre ce oferi.";
    default:
      return "Descrierea pare incompletă — spune pe scurt ce oferi.";
  }
}
