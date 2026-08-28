/**
 * Rejects filler text in partner-facing fields.
 *
 * Every layer used to check presence and nothing else: the wizard tested
 * `!!value.trim()`, the server's zod schema had `name: z.string().min(2)` and
 * `description: z.string().optional()`, and the columns carry no CHECK
 * constraints. So a profile with the artistic name "kk" and the description
 * "000" passed validation at every step and went to an admin for approval.
 *
 * These are deliberately blunt rules. They are meant to catch someone typing
 * to get past a form, not to judge writing — anything that reads like a real
 * name or a real sentence has to pass, in Romanian, Russian and English
 * alike, which is why every check is Unicode-aware and none of them assume
 * the Latin alphabet.
 *
 * The same module runs on both sides so the button's disabled state and the
 * API's rejection can never disagree.
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
/** Matches the threshold the description field already shows in the UI. */
export const DESCRIPTION_MIN = 40;
export const DESCRIPTION_MAX = 2000;

/**
 * A public-facing name: an artistic name, a venue name, a person's name.
 * Must contain letters and more than one distinct character, which is what
 * separates "kk" and "000" from "Ion" or "Дом".
 */
export function checkName(raw: string): TextCheck {
  const v = raw.trim();
  if (v.length < NAME_MIN) return fail("too_short");
  if (v.length > NAME_MAX) return fail("too_long");
  if (!hasLetter(v)) return fail("no_letters");
  if (distinctChars(v) < 2) return fail("too_few_distinct");
  return OK;
}

/**
 * The description clients read before booking. An empty one is allowed —
 * partners may fill it in later — but a non-empty one has to say something.
 */
export function checkDescription(raw: string | null | undefined): TextCheck {
  const v = (raw ?? "").trim();
  if (v.length === 0) return OK;
  if (v.length < DESCRIPTION_MIN) return fail("too_short");
  if (v.length > DESCRIPTION_MAX) return fail("too_long");
  if (!hasLetter(v)) return fail("no_letters");
  if (distinctChars(v) < 10) return fail("too_few_distinct");
  // Five words is the shortest thing that reads as a sentence rather than a
  // placeholder. Split on any Unicode whitespace so it holds for all three
  // languages the site ships in.
  if (v.split(/\s+/u).filter(Boolean).length < 5) return fail("too_few_words");
  return OK;
}

/** i18n key for the message to show, given an issue and which field it came from. */
export function textIssueKey(field: "name" | "description", issue: TextIssue) {
  return `validation.${field}.${issue}`;
}
