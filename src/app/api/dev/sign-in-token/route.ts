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
  // Gated by ENABLE_TEST_LOGIN env flag (set it to "1" in Vercel to expose
  // the test-login flow on the live site). Defaults to ON in development.
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
