// M5 — Per-vendor iCal feed token.
//
// The token is a deterministic HMAC of the artist id + a process secret so
// we don't need to persist anything. Admins can rotate feeds for everyone
// by rotating ICAL_SECRET (or CLERK_SECRET_KEY as a fallback). The token
// is URL-safe base64 truncated to 24 chars — still ~144 bits of entropy.

import { createHmac } from "crypto";

const SECRET =
  process.env.ICAL_SECRET ??
  process.env.CLERK_SECRET_KEY ??
  "epetrecere-dev-ical-secret";

export function getIcalToken(artistId: number): string {
  return createHmac("sha256", SECRET)
    .update(`ical-feed|${artistId}`)
    .digest("base64url")
    .slice(0, 24);
}

export function verifyIcalToken(artistId: number, token: string): boolean {
  const expected = getIcalToken(artistId);
  if (expected.length !== token.length) return false;
  // Constant-time-ish compare
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return ok === 0;
}
