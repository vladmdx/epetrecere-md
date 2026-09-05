import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_PREFIX = "ep_moments_";

function secret(): string {
  const value =
    process.env.MOMENTS_ACCESS_SECRET ||
    process.env.GUEST_DATA_ENCRYPTION_KEY;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("MOMENTS_ACCESS_SECRET is not configured");
  }
  return value || "epetrecere-local-moments-only";
}

function digest(value: string): Buffer {
  return createHmac("sha256", secret()).update(value).digest();
}

export function momentsCookieName(slug: string): string {
  return `${COOKIE_PREFIX}${createHmac("sha256", "cookie-name").update(slug).digest("hex").slice(0, 16)}`;
}

/** Stable six-digit PIN that the authenticated organizer can retrieve.
 * It is never stored in the database and cannot be derived without the
 * server-side secret. */
export function momentsAccessPin(planId: number, slug: string): string {
  const n = digest(`pin:${planId}:${slug}`).readUInt32BE(0);
  return String(100000 + (n % 900000));
}

export function isValidMomentsPin(
  candidate: string,
  planId: number,
  slug: string,
): boolean {
  const expected = Buffer.from(momentsAccessPin(planId, slug));
  const supplied = Buffer.from(candidate.trim());
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function momentsAccessToken(slug: string): string {
  return digest(`access:${slug}`).toString("base64url");
}

export function isValidMomentsAccessToken(
  token: string | null | undefined,
  slug: string,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(momentsAccessToken(slug));
  const supplied = Buffer.from(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function requestHasMomentsAccess(
  request: { cookies: { get(name: string): { value: string } | undefined } },
  slug: string,
): boolean {
  return isValidMomentsAccessToken(
    request.cookies.get(momentsCookieName(slug))?.value,
    slug,
  );
}
