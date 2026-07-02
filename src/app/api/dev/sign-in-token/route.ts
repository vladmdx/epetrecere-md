import { NextRequest, NextResponse } from "next/server";
import { createClerkClient } from "@clerk/backend";

// Predefined test personas — a stable short key → email in the current
// Clerk instance. Each time this route is hit it resolves the real Clerk
// userId by email (so it works in both dev and prod Clerk instances) and
// mints a one-shot sign-in token. Intended for /test-login demo access.
const TEST_PERSONAS: Record<string, { email: string }> = {
  igor: { email: "igor.nedoseikin@epetrecere.md" },
  client: { email: "client.test@epetrecere.md" },
};

export async function GET(req: NextRequest) {
  // Two-factor gate for this password-less token minter:
  //   1. ENABLE_TEST_LOGIN=1 turns the feature on at all (defaults OFF in
  //      production, ON in local dev where the flag is typically set).
  //   2. TEST_LOGIN_SECRET must match the `key` the caller supplies (via the
  //      ?key= in the demo link or the x-test-login-key header). This keeps
  //      the live demo working while making sure it can't be triggered by
  //      anyone who merely guesses the /test-login URL.
  //
  // In production the secret is MANDATORY: if ENABLE_TEST_LOGIN=1 but no
  // TEST_LOGIN_SECRET is configured we fail closed, so an accidental flag
  // on prod can never hand out sessions. Every rejection returns the same
  // { error: "disabled" } shape so /test-login renders a plain 404 and
  // never hints at which gate failed.
  const disabled = NextResponse.json({ error: "disabled" }, { status: 403 });

  if (process.env.ENABLE_TEST_LOGIN !== "1") return disabled;

  const secret = process.env.TEST_LOGIN_SECRET;
  const isProd =
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production";

  if (secret) {
    const key =
      req.nextUrl.searchParams.get("key") ||
      req.headers.get("x-test-login-key");
    if (key !== secret) return disabled;
  } else if (isProd) {
    console.warn(
      "[test-login] ENABLE_TEST_LOGIN=1 on production without TEST_LOGIN_SECRET — refusing.",
    );
    return disabled;
  }

  const who = req.nextUrl.searchParams.get("user") || "";
  const persona = TEST_PERSONAS[who];
  if (!persona) {
    return NextResponse.json({ error: "unknown user" }, { status: 400 });
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "CLERK_SECRET_KEY missing" },
      { status: 500 },
    );
  }

  try {
    const clerk = createClerkClient({ secretKey });

    // Look up the user in the current Clerk instance by email
    const { data: users } = await clerk.users.getUserList({
      emailAddress: [persona.email],
      limit: 1,
    });
    const user = users[0];
    if (!user) {
      return NextResponse.json(
        { error: `test user ${persona.email} not found in this Clerk instance` },
        { status: 404 },
      );
    }

    const token = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 600,
    });

    return NextResponse.json({ token: token.token });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
