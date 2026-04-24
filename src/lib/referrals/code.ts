// Referral code utilities. Codes are deterministic-ish per user: built
// from a short slug of their name/email + a 4-char random tail so they
// look friendly (`vlad-7b2c`) but collisions are practically impossible.
//
// On conflict with an existing code we retry up to 5 times with a fresh
// random tail.

import { createHash, randomBytes } from "crypto";

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789"; // no 0/1/l confusables

function tail(len = 4): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Make a short, readable prefix from a name/email. */
function prefix(source: string): string {
  const cleaned = source
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("@")[0]
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  if (cleaned.length >= 3) return cleaned;
  // Fallback: 6 chars from hash of the raw source
  return createHash("sha256")
    .update(source)
    .digest("hex")
    .slice(0, 6);
}

/** One candidate code. The caller should loop on DB uniqueness failure. */
export function buildReferralCode(nameOrEmail: string): string {
  return `${prefix(nameOrEmail)}-${tail()}`;
}
