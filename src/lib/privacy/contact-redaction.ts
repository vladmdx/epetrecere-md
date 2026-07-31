const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\s().-]*){8,}/g;

export function containsContact(value: string) {
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_PATTERN.lastIndex = 0;
  return EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value);
}

export function redactContact(value: string) {
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_PATTERN.lastIndex = 0;
  return value
    .replace(EMAIL_PATTERN, "[email disponibil după confirmare]")
    .replace(PHONE_PATTERN, "[telefon disponibil după confirmare]");
}
