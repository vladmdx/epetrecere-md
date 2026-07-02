import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Google OAuth2 callback for Calendar sync.
 *
 * Flow:
 * 1. Vendor clicks "Connect Google Calendar" → hits this endpoint with no
 *    `code`, which mints a CSRF nonce (cookie + `state`) and redirects to
 *    the Google OAuth consent screen.
 * 2. Google redirects back here with ?code=...&state=...
 * 3. We verify the `state` nonce against our cookie, exchange the code for
 *    tokens, and store the refresh_token in DB for the signed-in user.
 * 4. Background job uses refresh_token to sync calendar events.
 *
 * Required env vars:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 */

const STATE_COOKIE = "g_oauth_state";
const STATE_COOKIE_PATH = "/api/auth/google/callback";

/** Only allow redirects back into our own dashboard surface. Anything else
 *  falls back to the venue calendar page (primary consumer of this flow). */
function safeReturnPath(raw: string | null | undefined): string {
  if (!raw) return "/dashboard/sala/calendar";
  // Only accept in-app dashboard paths. No protocol, no host, no "..".
  if (!raw.startsWith("/dashboard/")) return "/dashboard/sala/calendar";
  if (raw.includes("..") || raw.includes("//")) return "/dashboard/sala/calendar";
  return raw;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const stateRaw = req.nextUrl.searchParams.get("state");

  // ---- Initiate branch: no `code` and no `error` → start OAuth ----
  if (!code && !error) {
    // Connecting a calendar requires an authenticated vendor. Without this,
    // an attacker could kick off an OAuth flow / set our state cookie in a
    // victim's browser.
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.redirect(
        new URL("/sign-in?redirect_url=/dashboard/sala/calendar", req.url),
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.redirect(
        new URL("/dashboard/sala/calendar?error=not_configured", req.url),
      );
    }

    const desiredReturn = safeReturnPath(
      req.nextUrl.searchParams.get("return") || stateRaw,
    );

    // CSRF: mint a random nonce, store it in an HttpOnly cookie, and echo it
    // back inside `state`. On the callback we require the two to match, so a
    // forged callback (attacker-supplied `code`) that lacks our cookie — or
    // whose `state` we didn't issue — is rejected.
    const nonce = randomUUID();
    const signedState = `${nonce}|${desiredReturn}`;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;
    const scope = "https://www.googleapis.com/auth/calendar.readonly";
    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth" +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      "&response_type=code" +
      `&scope=${encodeURIComponent(scope)}` +
      "&access_type=offline&prompt=consent" +
      `&state=${encodeURIComponent(signedState)}`;

    const res = NextResponse.redirect(authUrl);
    res.cookies.set(STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: STATE_COOKIE_PATH,
      maxAge: 600,
    });
    return res;
  }

  // ---- Callback branch: verify state, then exchange the code ----
  const [stateNonce, statePath] = (stateRaw || "").split("|");
  const returnPath = safeReturnPath(statePath || stateRaw);

  if (error) {
    return NextResponse.redirect(new URL(`${returnPath}?error=denied`, req.url));
  }

  // CSRF check: the nonce echoed in `state` must match the one we set in the
  // HttpOnly cookie at initiation. Reject anything that doesn't line up.
  const cookieNonce = req.cookies.get(STATE_COOKIE)?.value;
  if (!stateNonce || !cookieNonce || stateNonce !== cookieNonce) {
    const res = NextResponse.redirect(
      new URL(`${returnPath}?error=invalid_state`, req.url),
    );
    res.cookies.delete({ name: STATE_COOKIE, path: STATE_COOKIE_PATH });
    return res;
  }

  // Must still be the signed-in vendor to attach tokens to their account.
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    const res = NextResponse.redirect(
      new URL(`${returnPath}?error=unauthorized`, req.url),
    );
    res.cookies.delete({ name: STATE_COOKIE, path: STATE_COOKIE_PATH });
    return res;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL(`${returnPath}?error=not_configured`, req.url));
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL(`${returnPath}?error=token_exchange_failed`, req.url));
    }

    const tokens = await tokenRes.json();

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
    await db
      .update(users)
      .set({
        googleAccessToken: tokens.access_token || null,
        googleRefreshToken: tokens.refresh_token || null,
        googleTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.clerkId, clerkId));

    const res = NextResponse.redirect(new URL(`${returnPath}?success=connected`, req.url));
    res.cookies.delete({ name: STATE_COOKIE, path: STATE_COOKIE_PATH });
    return res;
  } catch {
    return NextResponse.redirect(new URL(`${returnPath}?error=unknown`, req.url));
  }
}
