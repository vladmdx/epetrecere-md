const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\s().-]*){8,}/g;
const LINK_PATTERN = /(?:https?:\/\/|www\.|(?:t|wa)\.me\/|(?:telegram|viber):\/\/)[^\s<>"']+|\b[a-z0-9][a-z0-9.-]*\.(?:md|ro|ru|com|net|org|online|site|eu)(?:\/[^\s<>"']*)?|@[\p{L}\p{N}_][\p{L}\p{N}_.]{2,}/giu;
const clean = (value: string) => value.normalize("NFKC").replace(/[\u200b-\u200f\u2060\ufeff]/g, "");

export function containsContact(value: string) {
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_PATTERN.lastIndex = 0;
  LINK_PATTERN.lastIndex = 0;
  const normalized = clean(value);
  return EMAIL_PATTERN.test(normalized) || PHONE_PATTERN.test(normalized) || LINK_PATTERN.test(normalized);
}

export function redactContact(value: string) {
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_PATTERN.lastIndex = 0;
  LINK_PATTERN.lastIndex = 0;
  return clean(value)
    .replace(EMAIL_PATTERN, "[email disponibil după confirmare]")
    .replace(PHONE_PATTERN, "[telefon disponibil după confirmare]")
    .replace(LINK_PATTERN, "[contact disponibil după confirmare]");
}
