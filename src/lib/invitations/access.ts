import { randomBytes } from "node:crypto";

const RSVP_GRACE_DAYS = 14;

export function generateGuestToken(): string {
  return randomBytes(24).toString("base64url");
}

/** RSVP remains available through the event and a short correction window.
 * Undated drafts get 90 days, and are refreshed when they are sent. */
export function guestTokenExpiry(eventDate?: string | null): Date {
  const base = eventDate ? new Date(`${eventDate}T23:59:59.999Z`) : new Date();
  if (Number.isNaN(base.getTime())) return guestTokenExpiry(null);
  base.setUTCDate(base.getUTCDate() + (eventDate ? RSVP_GRACE_DAYS : 90));
  return base;
}

export function isGuestTokenActive(row: {
  rsvpTokenExpiresAt?: Date | null;
  rsvpTokenRevokedAt?: Date | null;
}): boolean {
  return !row.rsvpTokenRevokedAt &&
    (!row.rsvpTokenExpiresAt || row.rsvpTokenExpiresAt.getTime() > Date.now());
}
