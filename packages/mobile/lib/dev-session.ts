import { Platform } from "react-native";

/**
 * Signing in as a test account, without a password.
 *
 * Testing anything behind the sign-in screen used to require somebody typing
 * a real password into the simulator by hand, which meant automated runs
 * stopped at the login form. This asks the web app's dev-only endpoint for a
 * Clerk sign-in token and redeems it — the mechanism Clerk provides for
 * exactly this, so no credential is ever stored, typed, or logged.
 *
 * Everything here is behind `__DEV__`, which Metro replaces with a literal
 * `false` in a production bundle. What that guarantees is that the branch
 * cannot execute and that the secret and the address are folded out at the
 * Babel stage. It does NOT guarantee that every trace is gone — the function
 * body and the endpoint string may survive minification, so treat "no secret
 * ships" as the property, not "no code ships".
 *
 * Requires, on the machine running the web app:
 *   DEV_TEST_LOGIN_SECRET   — a shared secret, also given to the app as
 *                             EXPO_PUBLIC_DEV_LOGIN_SECRET
 *   DEV_TEST_LOGIN_EMAILS   — the accounts this is allowed to sign in as
 * and, in packages/mobile/.env:
 *   EXPO_PUBLIC_DEV_LOGIN_SECRET
 *   EXPO_PUBLIC_DEV_LOGIN_EMAIL
 *   EXPO_PUBLIC_DEV_API_ORIGIN   — defaults to http://localhost:3000
 *
 * Never set EXPO_PUBLIC_DEV_LOGIN_SECRET in an EAS profile. A development or
 * preview build has `__DEV__ === true`, so it would carry the secret to
 * everyone who installs it; only a local .env is safe.
 */

/**
 * Both reads are wrapped in `__DEV__` so they constant-fold away rather than
 * relying on the minifier to notice them later. That distinction is not
 * theoretical: written as a bare read, the address was inlined by Babel and
 * survived into a production Hermes bundle — verified by grepping the
 * exported bytecode for a canary value.
 */
const DEV_SECRET = __DEV__
  ? (process.env.EXPO_PUBLIC_DEV_LOGIN_SECRET ?? "")
  : "";

/**
 * Comma-separated, because testing a marketplace means being both sides of
 * it: a client sends a request, a partner has to receive it. Editing an env
 * var and restarting Metro between the two made every two-sided check a
 * five-minute detour.
 */
export const DEV_LOGIN_EMAILS: string[] = __DEV__
  ? (process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)
  : [];

/** The first one, for the label under the button when there is only one. */
export const DEV_LOGIN_EMAIL = DEV_LOGIN_EMAILS[0] ?? "";

export const DEV_LOGIN_AVAILABLE =
  __DEV__ && !!DEV_SECRET && DEV_LOGIN_EMAILS.length > 0;

/**
 * The dev endpoint lives outside /api/v1 on purpose, so derive its host from
 * the API base rather than adding a second URL to keep in step.
 *
 * A simulator reaches the host machine on localhost; an Android emulator
 * needs 10.0.2.2 for the same thing, and a device on the LAN needs the real
 * address, which the developer sets through EXPO_PUBLIC_API_URL anyway.
 */
function devEndpoint(): string {
  // Its own variable, not derived from EXPO_PUBLIC_API_URL. That base points
  // at https://epetrecere.md in every profile in this repo — including the
  // development one — so deriving from it sent the shared secret to the
  // production edge on every platform, where it landed in request logs
  // before being refused.
  const origin =
    process.env.EXPO_PUBLIC_DEV_API_ORIGIN ?? "http://localhost:3000";
  // An Android emulator reaches the host machine at 10.0.2.2, not localhost.
  const host =
    Platform.OS === "android"
      ? origin
          .replace("//localhost", "//10.0.2.2")
          .replace("//127.0.0.1", "//10.0.2.2")
      : origin;
  return `${host}/api/dev/test-session`;
}

/**
 * The secret must never leave the machine. Anything that is not loopback or
 * a private network is refused before the request is made, naming the host
 * it was about to contact — a misconfiguration should be obvious, not a
 * silent transmission.
 */
function assertLocal(url: string): void {
  const host = url.replace(/^https?:\/\//, "").split(/[/:]/)[0] ?? "";
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "10.0.2.2" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (!isLocal) {
    throw new Error(
      `Refusing to send the dev secret to "${host}". EXPO_PUBLIC_DEV_API_ORIGIN must point at your own machine — the default is http://localhost:3000.`,
    );
  }
}

export interface DevTicket {
  ticket: string;
  userId: string;
}

/**
 * Fetches a one-minute sign-in token. Throws with a readable message: this
 * runs only in development, where the useful thing is to say plainly what is
 * misconfigured rather than to fail quietly.
 */
export async function fetchDevTicket(email = DEV_LOGIN_EMAIL): Promise<DevTicket> {
  if (!__DEV__) throw new Error("Dev sign-in is not available in this build.");

  const url = devEndpoint();
  assertLocal(url);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dev-login-secret": DEV_SECRET,
      },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new Error(
      `Could not reach ${url}. Is the web app running locally, and does EXPO_PUBLIC_API_URL point at it?`,
    );
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    // The route answers 404 twice, and the second one carries a useful
    // message about the account or the Clerk instance. Prefer the server's
    // words whenever it sent any; only fall back to guessing when the body
    // is empty, which is the only case the refusal gates produce.
    let fromServer = "";
    try {
      fromServer = (JSON.parse(raw) as { error?: string })?.error ?? "";
    } catch {
      fromServer = raw.trim();
    }
    if (fromServer) throw new Error(fromServer);
    if (res.status === 404) {
      throw new Error(
        "The dev endpoint refused without explanation. Either the web app is running in production mode, DEV_TEST_LOGIN_SECRET is unset, the secret does not match, or you are rate limited.",
      );
    }
    throw new Error(`Dev sign-in failed with HTTP ${res.status}.`);
  }

  const data = JSON.parse(raw) as DevTicket;
  if (!data?.ticket) throw new Error("The dev endpoint returned no ticket.");
  return data;
}
