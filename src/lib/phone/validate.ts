// Country-aware phone validation.
//
// We don't ship a full libphonenumber on the server — most signups are
// Moldovan numbers and we just need a sanity check that the dial-able
// digits match the format the country uses. Foreign numbers (people
// living in Bucharest, Kyiv, Odesa) are still accepted on a permissive
// digit-count rule so we don't block diaspora users.
//
// Returns either a normalized E.164-ish string ("+373" prefix preserved)
// or an error message keyed in Romanian (the only UI language so far).

const MOLDOVA_PREFIXES = ["+373", "00373", "373"] as const;
const ROMANIA_PREFIXES = ["+40", "0040", "40"] as const;
const UKRAINE_PREFIXES = ["+380", "00380", "380"] as const;

export type PhoneValidationResult =
  | { ok: true; e164: string; country: "MD" | "RO" | "UA" | "OTHER" }
  | { ok: false; error: string };

/** Strip everything that isn't a digit or leading '+'. */
function clean(input: string): string {
  const trimmed = input.trim();
  // Keep one leading '+', drop the rest of the noise.
  const startsWithPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return startsWithPlus ? `+${digits}` : digits;
}

export function validatePhone(input: string): PhoneValidationResult {
  if (typeof input !== "string") {
    return { ok: false, error: "Numărul de telefon este invalid." };
  }
  const cleaned = clean(input);
  if (cleaned.length < 6) {
    return { ok: false, error: "Numărul de telefon este prea scurt." };
  }

  // Moldova — the bulk of our traffic. Local format is 8 digits after the
  // country code (e.g. +373 69 123 456). Accept "+373", "00373", "373", or
  // bare 8-digit local with no prefix at all.
  for (const prefix of MOLDOVA_PREFIXES) {
    if (cleaned.startsWith(prefix)) {
      const local = cleaned.slice(prefix.length).replace(/^0+/, "");
      if (!/^\d{8}$/.test(local)) {
        return {
          ok: false,
          error:
            "Numărul de Moldova trebuie să aibă exact 8 cifre după +373 (ex. +373 69 123 456).",
        };
      }
      return { ok: true, e164: `+373${local}`, country: "MD" };
    }
  }
  // Bare 8-digit local (no country code) → assume Moldova.
  if (/^\d{8}$/.test(cleaned)) {
    return { ok: true, e164: `+373${cleaned}`, country: "MD" };
  }

  // Romania — 9 digits after the country code.
  for (const prefix of ROMANIA_PREFIXES) {
    if (cleaned.startsWith(prefix)) {
      const local = cleaned.slice(prefix.length).replace(/^0+/, "");
      if (!/^\d{9}$/.test(local)) {
        return {
          ok: false,
          error:
            "Numărul de România trebuie să aibă exact 9 cifre după +40.",
        };
      }
      return { ok: true, e164: `+40${local}`, country: "RO" };
    }
  }

  // Ukraine — 9 digits after the country code.
  for (const prefix of UKRAINE_PREFIXES) {
    if (cleaned.startsWith(prefix)) {
      const local = cleaned.slice(prefix.length).replace(/^0+/, "");
      if (!/^\d{9}$/.test(local)) {
        return {
          ok: false,
          error:
            "Numărul de Ucraina trebuie să aibă exact 9 cifre după +380.",
        };
      }
      return { ok: true, e164: `+380${local}`, country: "UA" };
    }
  }

  // Other international — keep it permissive but cap so junk isn't accepted.
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    if (digits.length < 7 || digits.length > 15) {
      return {
        ok: false,
        error:
          "Numărul internațional trebuie să aibă între 7 și 15 cifre după +.",
      };
    }
    return { ok: true, e164: cleaned, country: "OTHER" };
  }

  return {
    ok: false,
    error:
      "Folosește un format internațional valid (+373..., +40..., +380... sau alt prefix).",
  };
}

/** Convenience for components that just need a yes/no. */
export function isValidPhone(input: string): boolean {
  return validatePhone(input).ok;
}
