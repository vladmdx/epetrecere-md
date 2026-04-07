import { NextRequest, NextResponse } from "next/server";

/**
 * Google OAuth2 callback for Calendar sync.
 *
 * Flow:
 * 1. Vendor clicks "Connect Google Calendar" → redirects to Google OAuth consent
 * 2. Google redirects back here with ?code=...
 * 3. We exchange code for tokens, store refresh_token in DB
 * 4. Background job uses refresh_token to sync calendar events
 *
 * Required env vars:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/dashboard/calendar?error=denied", req.url));
  }

  if (!code) {
    // Initiate OAuth flow
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.redirect(new URL("/dashboard/calendar?error=not_configured", req.url));
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;
    const scope = "https://www.googleapis.com/auth/calendar.readonly";
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;

    return NextResponse.redirect(authUrl);
  }

  // Exchange code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/dashboard/calendar?error=not_configured", req.url));
  }

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
      return NextResponse.redirect(new URL("/dashboard/calendar?error=token_exchange_failed", req.url));
    }

    const tokens = await tokenRes.json();
    // TODO: Store tokens.refresh_token in DB for the current user
    // This enables background sync via Inngest cron job

    return NextResponse.redirect(new URL("/dashboard/calendar?success=connected", req.url));
  } catch {
    return NextResponse.redirect(new URL("/dashboard/calendar?error=unknown", req.url));
  }
}
