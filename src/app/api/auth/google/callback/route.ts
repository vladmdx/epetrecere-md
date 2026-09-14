import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createGoogleOAuthState,
  GOOGLE_OAUTH_DEFAULT_RETURN_PATH,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_TTL_SECONDS,
  safeGoogleOAuthReturnPath,
  verifyGoogleOAuthState,
} from "@/lib/google/oauth-state";

const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";

function redirectWithResult(
  req: NextRequest,
  returnPath: string,
  result: { success: string } | { error: string },
  clearStateCookie = false,
): NextResponse {
  const destination = new URL(returnPath, req.url);
  if ("success" in result) destination.searchParams.set("success", result.success);
  else destination.searchParams.set("error", result.error);
  const response = NextResponse.redirect(destination);
  if (clearStateCookie) {
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: GOOGLE_OAUTH_CALLBACK_PATH,
      maxAge: 0,
    });
  }
  return response;
}

/** Google OAuth2 Calendar connection. The provider state is an opaque random
 * nonce; its encrypted actor-bound context lives in a short-lived HttpOnly
 * cookie and is consumed before any token exchange. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const providerError = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const { userId: clerkId, sessionId } = await auth();

  // No provider callback fields means this request initiates a new flow.
  if (!code && !providerError && !state) {
    const requestedReturnPath = safeGoogleOAuthReturnPath(
      req.nextUrl.searchParams.get("return"),
    );
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!clerkId || !sessionId) {
      return redirectWithResult(
        req,
        requestedReturnPath,
        { error: "authentication_required" },
      );
    }
    if (!clientId || !clientSecret || !appUrl) {
      return redirectWithResult(
        req,
        requestedReturnPath,
        { error: "not_configured" },
      );
    }

    const oauthState = createGoogleOAuthState({
      secret: clientSecret,
      userId: clerkId,
      sessionId,
      returnPath: requestedReturnPath,
    });
    const redirectUri = new URL(GOOGLE_OAUTH_CALLBACK_PATH, appUrl).toString();
    const authorizationUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      prompt: "consent",
      state: oauthState.state,
    }).toString();
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, oauthState.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: GOOGLE_OAUTH_CALLBACK_PATH,
      maxAge: GOOGLE_OAUTH_STATE_TTL_SECONDS,
    });
    return response;
  }

  // Validate and consume the state before any provider token exchange. Every
  // callback response clears it, including denied and invalid flows.
  const verification = clerkId && sessionId && process.env.GOOGLE_CLIENT_SECRET
    ? verifyGoogleOAuthState({
        secret: process.env.GOOGLE_CLIENT_SECRET,
        userId: clerkId,
        sessionId,
        state,
        cookieValue: req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value ?? null,
      })
    : { ok: false as const, reason: "missing" as const };
  const returnPath = verification.ok
    ? verification.returnPath
    : GOOGLE_OAUTH_DEFAULT_RETURN_PATH;
  if (!clerkId || !sessionId) {
    return redirectWithResult(
      req,
      returnPath,
      { error: "authentication_required" },
      true,
    );
  }
  if (!verification.ok) {
    return redirectWithResult(
      req,
      returnPath,
      { error: "invalid_state" },
      true,
    );
  }
  if (providerError) {
    return redirectWithResult(req, returnPath, { error: "denied" }, true);
  }
  if (!code) {
    return redirectWithResult(req, returnPath, { error: "invalid_state" }, true);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !appUrl) {
    return redirectWithResult(req, returnPath, { error: "not_configured" }, true);
  }
  const redirectUri = new URL(GOOGLE_OAUTH_CALLBACK_PATH, appUrl).toString();

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      try {
        await tokenRes.body?.cancel();
      } catch {
        // Never inspect or log a provider response body containing token data.
      }
      return redirectWithResult(
        req,
        returnPath,
        { error: "token_exchange_failed" },
        true,
      );
    }

    const tokens = (await tokenRes.json()) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof tokens.access_token !== "string" || !tokens.access_token) {
      return redirectWithResult(
        req,
        returnPath,
        { error: "token_exchange_failed" },
        true,
      );
    }

    const expiresAt = typeof tokens.expires_in === "number"
      && Number.isFinite(tokens.expires_in)
      && tokens.expires_in > 0
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
    const update: Partial<typeof users.$inferInsert> = {
      googleAccessToken: tokens.access_token,
      googleTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    };
    // Google may omit refresh_token on repeated consent. Preserve the valid
    // stored token instead of silently disconnecting the account.
    if (typeof tokens.refresh_token === "string" && tokens.refresh_token) {
      update.googleRefreshToken = tokens.refresh_token;
    }
    await db.update(users).set(update).where(eq(users.clerkId, clerkId));

    return redirectWithResult(
      req,
      returnPath,
      { success: "connected" },
      true,
    );
  } catch {
    return redirectWithResult(req, returnPath, { error: "unknown" }, true);
  }
}
