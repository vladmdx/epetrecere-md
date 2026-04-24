// Google Calendar helpers used by the Inngest pull job.
//
// Two entry points:
//  - refreshAccessToken() — exchanges a refresh_token for a fresh access
//    token when the stored one is expired. Updates the users row.
//  - fetchUpcomingEvents() — reads the primary calendar for [now, +90d]
//    and returns all-day blocking events (timed events ≤ 1h are skipped
//    since they don't reliably represent "busy" in a venue context).

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface GoogleEvent {
  id: string;
  summary: string;
  start: string; // YYYY-MM-DD (normalized to date)
  end: string; // YYYY-MM-DD (exclusive end, per iCal convention)
  status: "confirmed" | "tentative" | "cancelled";
}

/** Refresh a user's Google access token. Writes the new access token +
 *  expiry back to the users row so future calls skip this step. */
export async function refreshAccessToken(userId: string): Promise<string | null> {
  const [user] = await db
    .select({
      googleRefreshToken: users.googleRefreshToken,
      googleAccessToken: users.googleAccessToken,
      googleTokenExpiresAt: users.googleTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.googleRefreshToken) return null;

  // If we already have a non-expired token, reuse it.
  const expiry = user.googleTokenExpiresAt;
  if (
    user.googleAccessToken &&
    expiry &&
    expiry.getTime() > Date.now() + 60_000
  ) {
    return user.googleAccessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: user.googleRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("[google] refresh failed", await res.text());
    // If the refresh token is revoked, Google returns 400 invalid_grant.
    // Null the token so we don't keep hammering.
    if (res.status === 400 || res.status === 401) {
      await db
        .update(users)
        .set({
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiresAt: null,
        })
        .where(eq(users.id, userId));
    }
    return null;
  }

  const tokens = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };

  const newExpiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  await db
    .update(users)
    .set({
      googleAccessToken: tokens.access_token,
      googleTokenExpiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return tokens.access_token;
}

/** Google returns start/end as either `date` (all-day) or `dateTime`
 *  (timed). We normalize to YYYY-MM-DD for our day-based calendar. */
function normalizeToDate(part: { date?: string; dateTime?: string }): string | null {
  if (part.date) return part.date;
  if (part.dateTime) return part.dateTime.slice(0, 10);
  return null;
}

/** Fetch events in [now, +90d]. Filters cancelled events and skips
 *  short (< 60min) timed events that typically aren't real blockers. */
export async function fetchUpcomingEvents(
  accessToken: string,
): Promise<GoogleEvent[]> {
  const now = new Date();
  const ninetyDaysOut = new Date(
    now.getTime() + 90 * 24 * 60 * 60 * 1000,
  );

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: ninetyDaysOut.toISOString(),
    singleEvents: "true", // expand recurring
    orderBy: "startTime",
    maxResults: "500",
  });

  const res = await fetch(`${GOOGLE_EVENTS_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error("[google] events fetch failed", res.status);
    return [];
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      status?: string;
      start?: { date?: string; dateTime?: string };
      end?: { date?: string; dateTime?: string };
    }>;
  };

  const events: GoogleEvent[] = [];
  for (const item of data.items ?? []) {
    if (!item.start || !item.end) continue;
    if (item.status === "cancelled") continue;

    const start = normalizeToDate(item.start);
    const end = normalizeToDate(item.end);
    if (!start || !end) continue;

    // Skip timed events shorter than an hour — they're usually a call, not a booking.
    if (item.start.dateTime && item.end.dateTime) {
      const duration =
        new Date(item.end.dateTime).getTime() -
        new Date(item.start.dateTime).getTime();
      if (duration < 60 * 60 * 1000) continue;
    }

    events.push({
      id: item.id,
      summary: item.summary ?? "Eveniment Google",
      start,
      end,
      status: (item.status ?? "confirmed") as GoogleEvent["status"],
    });
  }
  return events;
}

/** Expand [start, end) to the list of day strings it covers. iCal/Google
 *  use exclusive ends for all-day events, so we stop BEFORE `end`. */
export function expandDays(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (cur < last) {
    out.push(
      `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`,
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  // Safeguard for single-day events that set end === start (some clients do this)
  if (out.length === 0) out.push(start);
  return out;
}
