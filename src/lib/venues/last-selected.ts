/**
 * Last-selected venue cookie. Convenience only — never authorization.
 * server-only.
 */
import { cookies } from "next/headers";

export const LAST_VENUE_COOKIE = "epetrecere_last_venue";

export async function readLastVenueCookie(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(LAST_VENUE_COOKIE)?.value;
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function writeLastVenueCookie(venueId: number): Promise<void> {
  const store = await cookies();
  store.set(LAST_VENUE_COOKIE, String(venueId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}
