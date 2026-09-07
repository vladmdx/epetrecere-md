const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\+?\d(?:[\s().-]*\+?\d){7,}/g;
const LINK_PATTERN = /(?:https?:\/\/|www\.|(?:t|wa)\.me\/|(?:telegram|viber):\/\/)[^\s<>"']+|\b[a-z0-9][a-z0-9.-]*\.(?:md|ro|ru|com|net|org|online|site|eu)(?:\/[^\s<>"']*)?|@[\p{L}\p{N}_][\p{L}\p{N}_.]{2,}/giu;
const clean = (value: string) => value.normalize("NFKC").replace(/[\u200b-\u200f\u2060\ufeff]/g, "");

/** Exempt complete, valid calendar tokens, not date-like pieces of a phone.
 * Requiring the entire numeric candidate keeps +373 20.09.2026 and adjacent
 * digits locked. Four-digit years starting with 0 are not event dates. */
function isCalendarDate(value: string) {
  const iso = /^(\d{4})([-.])(\d{2})\2(\d{2})$/.exec(value);
  const local = /^(\d{2})([-.])(\d{2})\2(\d{4})$/.exec(value);
  if (!iso && !local) return false;
  const year = Number(iso ? iso[1] : local![4]);
  const month = Number(iso ? iso[3] : local![3]);
  const day = Number(iso ? iso[4] : local![1]);
  return year >= 1000 && month >= 1 && month <= 12 && day >= 1
    && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isCalendarCandidate(candidate: string, index: number, source: string) {
  const before = source[index - 1] ?? "";
  const after = source.slice(index + candidate.length);
  if (/[\p{L}\p{N}_+]/u.test(before) || /\+\s*\(?\s*$/.test(source.slice(0, index))) return false;
  if (isCalendarDate(candidate)) return !/^[\p{L}\p{N}_+]/u.test(after);

  // The phone scanner also consumes the hour in "20.09.2026 14:00".
  // Permit it only with a fully valid date and a complete 24-hour clock.
  const dateAndHour = /^(.{10})\s+(\d{1,2})$/.exec(candidate);
  return !!dateAndHour && isCalendarDate(dateAndHour[1])
    && Number(dateAndHour[2]) <= 23
    && /^:[0-5]\d(?=$|[^\p{L}\p{N}_])/u.test(after);
}

export function containsContact(value: string) {
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_PATTERN.lastIndex = 0;
  LINK_PATTERN.lastIndex = 0;
  const normalized = clean(value);
  return EMAIL_PATTERN.test(normalized)
    || [...normalized.matchAll(PHONE_PATTERN)].some(match => !isCalendarCandidate(match[0], match.index, normalized))
    || LINK_PATTERN.test(normalized);
}

export function redactContact(value: string) {
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_PATTERN.lastIndex = 0;
  LINK_PATTERN.lastIndex = 0;
  return clean(value)
    .replace(EMAIL_PATTERN, "[email disponibil după confirmare]")
    .replace(PHONE_PATTERN, (candidate, index, source) => isCalendarCandidate(candidate, index, source)
      ? candidate : "[telefon disponibil după confirmare]")
    .replace(LINK_PATTERN, "[contact disponibil după confirmare]");
}
