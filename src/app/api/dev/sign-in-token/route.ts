import { NextRequest, NextResponse } from "next/server";
import { createClerkClient } from "@clerk/backend";

// Predefined test personas — a stable short key → email in the current
// Clerk instance. Each time this route is hit it resolves the real Clerk
// userId by email (so it works in both dev and prod Clerk instances) and
// mints a one-shot sign-in token. Intended for /test-login demo access.
// Server-side only. These addresses used to be duplicated into the
// /test-login client component, which meant they were compiled into a public
// JS chunk and served to anyone who asked — a ready-made target list, and
// three real addresses for phishing, regardless of whether the flag was on.
const TEST_PERSONAS: Record<string, { email: string }> = {
  igor: { email: "igor.nedoseikin@epetrecere.md" },
  venue: { email: "venue.test@epetrecere.md" },
  client: { email: "client.test@epetrecere.md" },
};

export async function GET(req: NextRequest) {
  /**
   * Refused outright in production, before any flag is consulted.
   *
   * This used to be gated by ENABLE_TEST_LOGIN alone, and the comment here
   * invited setting that flag on the live site. One env var away, a plain
   * unauthenticated GET would hand any browser a ten-minute Clerk sign-in
   * ticket for a real account — no secret, no allow-list, no rate limit, and
   * three guessable persona keys. The compensating TEST_LOGIN_SECRET that
   * .env.example promised was never written.
   *
   * The refusal is on the environment, not on a flag, so nothing that can be
   * changed in a dashboard can undo it.
   */
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const enabled = process.env.ENABLE_TEST_LOGIN === "1";
  if (!enabled) {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
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
