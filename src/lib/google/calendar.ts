// Google Calendar helpers used by the Inngest pull job.
//
// Two entry points:
//  - refreshAccessToken() — exchanges a refresh_token for a fresh access
//    token when the stored one is expired. Updates the users row.
//  - fetchUpcomingEvents() — re-exported from the pure, fully paginated
//    provider client in calendar-events.ts.

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SAFE_GOOGLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const SAFE_GOOGLE_ERROR_STATUSES = new Set([
  400, 401, 403, 404, 408, 409, 413, 422, 425, 429, 500, 502, 503, 504,
]);
export {
  createGoogleCalendarSyncWindow,
  expandDays,
  fetchUpcomingEvents,
  GoogleCalendarFetchError,
  type GoogleEvent,
  type GoogleCalendarSyncWindow,
} from "./calendar-events";

export type GoogleCalendarAccessCredential = Readonly<{
  accessToken: string;
  credentialFingerprint: string;
}>;

type GoogleCalendarCredentialParts = Readonly<{
  refreshToken: string;
  accessToken: string | null;
  expiresAt: Date | null;
}>;

export class GoogleCalendarCredentialChangedError extends Error {
  readonly code = "GOOGLE_CALENDAR_CREDENTIAL_CHANGED";

  constructor() {
    super("Google Calendar credentials changed during synchronization.");
    this.name = "GoogleCalendarCredentialChangedError";
  }
}

/** Opaque, in-memory generation marker. Raw provider credentials are never
 * persisted in a sync plan or emitted to logs. */
export function googleCalendarCredentialFingerprint(
  credential: GoogleCalendarCredentialParts,
): string {
  return createHash("sha256")
    .update("epetrecere:google-calendar-credential:v1\0", "utf8")
    .update(credential.refreshToken, "utf8")
    .update("\0", "utf8")
    .update(credential.accessToken ?? "", "utf8")
    .update("\0", "utf8")
    .update(credential.expiresAt?.toISOString() ?? "", "utf8")
    .digest("hex");
}

function credentialMatch(
  userId: string,
  credential: GoogleCalendarCredentialParts,
) {
  return and(
    eq(users.id, userId),
    eq(users.googleRefreshToken, credential.refreshToken),
    credential.accessToken == null
      ? isNull(users.googleAccessToken)
      : eq(users.googleAccessToken, credential.accessToken),
    credential.expiresAt == null
      ? isNull(users.googleTokenExpiresAt)
      : eq(users.googleTokenExpiresAt, credential.expiresAt),
  );
}

/** Read only Google's documented short OAuth error code. The body is bounded
 * and never logged, so an upstream/proxy response cannot leak token material
 * or force an unbounded diagnostic allocation. */
export async function readGoogleTokenErrorCode(
  response: Response,
  maximumBytes = 4_096,
): Promise<string | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // Best effort; no provider body is inspected.
    }
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // Best effort; no provider body is inspected.
        }
        return null;
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const error = (parsed as Record<string, unknown>).error;
    return typeof error === "string" && /^[a-z_]{1,64}$/.test(error)
      ? error
      : null;
  } catch {
    return null;
  }
}

/** Refresh a user's Google access token. Writes the new access token +
 *  expiry back to the users row so future calls skip this step. */
export async function refreshAccessToken(
  userId: string,
  options: { expectedCredentialFingerprint?: string } = {},
): Promise<GoogleCalendarAccessCredential | null> {
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

  const snapshot: GoogleCalendarCredentialParts = {
    refreshToken: user.googleRefreshToken,
    accessToken: user.googleAccessToken,
    expiresAt: user.googleTokenExpiresAt,
  };
  const initialFingerprint = googleCalendarCredentialFingerprint(snapshot);
  if (
    options.expectedCredentialFingerprint
    && options.expectedCredentialFingerprint !== initialFingerprint
  ) {
    throw new GoogleCalendarCredentialChangedError();
  }

  // If we already have a non-expired token, reuse it.
  const expiry = user.googleTokenExpiresAt;
  if (
    user.googleAccessToken &&
    expiry &&
    expiry.getTime() > Date.now() + 60_000
  ) {
    return {
      accessToken: user.googleAccessToken,
      credentialFingerprint: initialFingerprint,
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: user.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (error) {
    const correlationId = createServerLogCorrelationId();
    console.error(
      "[google] token refresh request failed",
      safeServerErrorLog(error, {
        correlationId,
        allowedCodes: SAFE_GOOGLE_ERROR_CODES,
        allowedStatuses: SAFE_GOOGLE_ERROR_STATUSES,
      }),
    );
    return null;
  }

  if (!res.ok) {
    const providerErrorCode = await readGoogleTokenErrorCode(res);
    const correlationId = createServerLogCorrelationId();
    console.error(
      "[google] token refresh rejected",
      safeServerErrorLog(
        { name: "HttpResponseError", status: res.status },
        {
          correlationId,
          allowedStatuses: SAFE_GOOGLE_ERROR_STATUSES,
        },
      ),
    );
    // Only invalid_grant proves this refresh credential is unusable. Other
    // 400/401 responses (for example invalid_client) are configuration or
    // transient failures and must preserve the user's connection.
    if (res.status === 400 && providerErrorCode === "invalid_grant") {
      const [cleared] = await db
        .update(users)
        .set({
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiresAt: null,
        })
        .where(credentialMatch(userId, snapshot))
        .returning({ id: users.id });
      if (!cleared) throw new GoogleCalendarCredentialChangedError();
    }
    return null;
  }

  const tokens = (await res.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof tokens.access_token !== "string" || !tokens.access_token) {
    return null;
  }

  const newExpiresAt = typeof tokens.expires_in === "number"
    && Number.isFinite(tokens.expires_in)
    && tokens.expires_in > 0
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  const [updated] = await db
    .update(users)
    .set({
      googleAccessToken: tokens.access_token,
      googleTokenExpiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    .where(credentialMatch(userId, snapshot))
    .returning({ id: users.id });

  if (!updated) throw new GoogleCalendarCredentialChangedError();

  return {
    accessToken: tokens.access_token,
    credentialFingerprint: googleCalendarCredentialFingerprint({
      refreshToken: snapshot.refreshToken,
      accessToken: tokens.access_token,
      expiresAt: newExpiresAt,
    }),
  };
}
