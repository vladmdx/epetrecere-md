import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Mints a short-lived Clerk sign-in token for one allow-listed test account,
 * so automated testing can reach authenticated screens without anybody typing
 * a password into the app.
 *
 * This is an authentication bypass, and it replaces one that was worse: the
 * old /api/dev/sign-in-token took a plain GET, had no secret at all, and was
 * gated only by an env flag its own comment told you to set on production.
 * The rules here are the ones that route should have had.
 *
 *   1. NODE_ENV must not be "production", and VERCEL_ENV must not be
 *      "production". A production deployment therefore refuses, and no env
 *      var can undo it.
 *   2. DEV_TEST_LOGIN_SECRET must be set, with no default — a default is how
 *      this kind of thing ends up enabled somewhere nobody intended.
 *   3. The caller must present that secret. Compared as SHA-256 digests, so
 *      the comparison is fixed-length: it cannot throw on a length mismatch,
 *      and it leaks nothing about the secret's length.
 *   4. The address must appear in DEV_TEST_LOGIN_EMAILS. Knowing the secret
 *      is therefore not the same as owning the platform.
 *   5. Rate limited, like every other sensitive route in this app.
 *
 * EVERY failure answers 404 with an empty body — including a thrown Clerk
 * error, which is why the whole handler sits in a try/catch. A route that
 * answers 403 here, or 500, or 405 for a GET, is a route whose existence has
 * just been confirmed. That is why the other verbs below exist too.
 *
 * It deliberately does NOT live under /api/v1: that is the surface shipped
 * builds keep calling for years, and this must never become part of it.
 *
 * The ticket expires in 60 seconds. Note what that does and does not mean:
 * it bounds the window for REDEEMING the token, not the session that
 * redemption creates — that session lives as long as any other.
 */

const TOKEN_TTL_SECONDS = 60;

/** Same reading as the legal-acceptance route uses, kept local rather than
 *  extracted: this file should pull in as little as possible. */
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Same shape for every refusal, so no failure mode is distinguishable. */
function notFound() {
  return new NextResponse(null, { status: 404 });
}

function disabled(): boolean {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    !process.env.DEV_TEST_LOGIN_SECRET
  ) {
    return true;
  }

  /**
   * The environment gates above say where this code RUNS. They say nothing
   * about which Clerk instance it mints against — that is chosen by
   * CLERK_SECRET_KEY, and this repo's local config sits next to a pk_live_
   * publishable key. So a laptop running `next dev` can mint sessions for
   * real accounts on the live instance.
   *
   * Sometimes that is exactly what is wanted: testing against production data
   * is the only way to exercise real flows. But it should be a decision
   * someone made on purpose, not a side effect of which key happened to be in
   * .env.local. Against a live instance this route stays off until
   * DEV_TEST_LOGIN_ALLOW_LIVE is set to "1".
   */
  const live = process.env.CLERK_SECRET_KEY?.startsWith("sk_live_");
  if (live && process.env.DEV_TEST_LOGIN_ALLOW_LIVE !== "1") {
    console.warn(
      "[dev-test-session] refusing: CLERK_SECRET_KEY is a live key. Set DEV_TEST_LOGIN_ALLOW_LIVE=1 only if you mean to mint sessions for real accounts.",
    );
    return true;
  }

  return false;
}

/**
 * Fixed-length constant-time comparison. Hashing first sidesteps the trap in
 * the obvious version: guarding `timingSafeEqual` with a JS string-length
 * check compares UTF-16 code units while the function compares UTF-8 bytes,
 * so a multi-byte input passes the guard and then throws.
 */
function secretMatches(given: string | null): boolean {
  const expected = process.env.DEV_TEST_LOGIN_SECRET;
  if (!given || !expected) return false;
  const h = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(h(given), h(expected));
}

function allowedEmails(): string[] {
  return (process.env.DEV_TEST_LOGIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  if (disabled()) return notFound();

  try {
    const { success } = await rateLimit(`dev-login:${clientIp(req)}`, 5, 60_000);
    if (!success) return notFound();

    if (!secretMatches(req.headers.get("x-dev-login-secret"))) return notFound();

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email || !allowedEmails().includes(email)) {
      // Past the secret, so the caller is trusted enough for a real message.
      return NextResponse.json(
        {
          error:
            "That address is not in DEV_TEST_LOGIN_EMAILS. Add it there before asking for a token.",
        },
        { status: 403 },
      );
    }

    const client = await clerkClient();
    const { data: users } = await client.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });
    const user = users[0];
    if (!user) {
      // The most common cause is not a missing account but a mismatched
      // instance: a CLERK_SECRET_KEY for one Clerk instance while the app is
      // built with a publishable key for another. A token minted on one
      // instance cannot be redeemed on the other, so say so here rather than
      // letting it fail confusingly on the device.
      const kind = process.env.CLERK_SECRET_KEY?.startsWith("sk_live_")
        ? "live"
        : "test";
      return NextResponse.json(
        {
          error:
            `No Clerk user with the address ${email} on the ${kind} instance this server is configured for. ` +
            `Either the account does not exist, or CLERK_SECRET_KEY belongs to a different instance than the app's publishable key. ` +
            `This route signs in; it does not sign up.`,
        },
        { status: 404 },
      );
    }

    const token = await client.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: TOKEN_TTL_SECONDS,
    });

    // Left deliberately loud: if this ever prints somewhere it should not,
    // the log is the first thing that says so.
    console.warn(
      `[dev-test-session] issued a sign-in token for ${email} (${user.id})`,
    );

    return NextResponse.json({
      ticket: token.token,
      userId: user.id,
      expiresInSeconds: TOKEN_TTL_SECONDS,
    });
  } catch (err) {
    // A Clerk outage, a rotated key, a rate limit upstream — all of it comes
    // out as the same 404. The detail goes to the server log, where the
    // person running this can see it.
    console.error("[dev-test-session] failed", err);
    return notFound();
  }
}

/**
 * Every other verb answers exactly like a path that does not exist. Without
 * these, Next.js answers an unimplemented method with 405 — which tells an
 * unauthenticated stranger that this file is deployed.
 */
export const GET = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
