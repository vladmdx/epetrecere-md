import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "ep_google_oauth_state";
export const GOOGLE_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const GOOGLE_OAUTH_DEFAULT_RETURN_PATH = "/dashboard/sala/calendar";

const GOOGLE_OAUTH_STATE_VERSION = 1;
const GOOGLE_OAUTH_FUTURE_SKEW_MS = 30_000;

type GoogleOAuthStatePayload = Readonly<{
  v: typeof GOOGLE_OAUTH_STATE_VERSION;
  nonce: string;
  actor: string;
  returnPath: string;
  issuedAt: number;
}>;

export type GoogleOAuthStateVerification =
  | { ok: true; returnPath: string }
  | {
      ok: false;
      reason:
        | "missing"
        | "tampered"
        | "expired"
        | "actor_mismatch"
        | "return_path";
    };

/** Only same-origin dashboard paths can be carried through the OAuth round
 * trip. Parsing against a fixed origin also catches URL-normalization tricks. */
export function safeGoogleOAuthReturnPath(raw: string | null): string {
  if (!raw || raw.length > 512) return GOOGLE_OAUTH_DEFAULT_RETURN_PATH;
  if (
    !raw.startsWith("/dashboard/")
    || raw.includes("\\")
    || raw.includes("..")
    || /[\u0000-\u001f\u007f]/.test(raw)
    || /%(?:2e|2f|5c)/i.test(raw)
  ) {
    return GOOGLE_OAUTH_DEFAULT_RETURN_PATH;
  }
  try {
    const base = new URL("https://epetrecere.invalid");
    const parsed = new URL(raw, base);
    if (
      parsed.origin !== base.origin
      || !parsed.pathname.startsWith("/dashboard/")
    ) {
      return GOOGLE_OAUTH_DEFAULT_RETURN_PATH;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return GOOGLE_OAUTH_DEFAULT_RETURN_PATH;
  }
}

function encryptionKey(secret: string): Buffer {
  if (!secret) throw new Error("Google OAuth state secret is unavailable.");
  return createHash("sha256")
    .update("epetrecere:google-oauth-state:key:v1\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

function actorBinding(secret: string, userId: string, sessionId: string): string {
  return createHmac("sha256", secret)
    .update("epetrecere:google-oauth-state:actor:v1\0", "utf8")
    .update(userId, "utf8")
    .update("\0", "utf8")
    .update(sessionId, "utf8")
    .digest("base64url");
}

function sameOpaqueValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeCanonicalBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

function isPayload(value: unknown): value is GoogleOAuthStatePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(",")
      === "actor,issuedAt,nonce,returnPath,v"
    && record.v === GOOGLE_OAUTH_STATE_VERSION
    && typeof record.nonce === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(record.nonce)
    && typeof record.actor === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(record.actor)
    && typeof record.returnPath === "string"
    && typeof record.issuedAt === "number"
    && Number.isSafeInteger(record.issuedAt);
}

export function createGoogleOAuthState(input: {
  secret: string;
  userId: string;
  sessionId: string;
  returnPath: string | null;
  now?: number;
}): { state: string; cookieValue: string; returnPath: string } {
  const nonce = randomBytes(32).toString("base64url");
  const iv = randomBytes(12);
  const returnPath = safeGoogleOAuthReturnPath(input.returnPath);
  const payload: GoogleOAuthStatePayload = {
    v: GOOGLE_OAUTH_STATE_VERSION,
    nonce,
    actor: actorBinding(input.secret, input.userId, input.sessionId),
    returnPath,
    issuedAt: input.now ?? Date.now(),
  };
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(input.secret), iv);
  cipher.setAAD(Buffer.from("epetrecere:google-oauth-state:v1", "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    state: nonce,
    cookieValue: [
      "v1",
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      tag.toString("base64url"),
    ].join("."),
    returnPath,
  };
}

export function verifyGoogleOAuthState(input: {
  secret: string;
  userId: string;
  sessionId: string;
  state: string | null;
  cookieValue: string | null;
  now?: number;
}): GoogleOAuthStateVerification {
  if (!input.state || !input.cookieValue) {
    return { ok: false, reason: "missing" };
  }
  try {
    const [version, encodedIv, encodedCiphertext, encodedTag, ...extra] =
      input.cookieValue.split(".");
    if (
      version !== "v1"
      || !encodedIv
      || !encodedCiphertext
      || !encodedTag
      || extra.length > 0
    ) {
      return { ok: false, reason: "tampered" };
    }
    const iv = decodeCanonicalBase64Url(encodedIv);
    const ciphertext = decodeCanonicalBase64Url(encodedCiphertext);
    const tag = decodeCanonicalBase64Url(encodedTag);
    if (
      !iv
      || !ciphertext
      || !tag
      || iv.length !== 12
      || tag.length !== 16
      || ciphertext.length === 0
    ) {
      return { ok: false, reason: "tampered" };
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(input.secret),
      iv,
    );
    decipher.setAAD(Buffer.from("epetrecere:google-oauth-state:v1", "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const payload: unknown = JSON.parse(plaintext);
    if (!isPayload(payload) || !sameOpaqueValue(payload.nonce, input.state)) {
      return { ok: false, reason: "tampered" };
    }
    const now = input.now ?? Date.now();
    if (
      payload.issuedAt > now + GOOGLE_OAUTH_FUTURE_SKEW_MS
      || now - payload.issuedAt > GOOGLE_OAUTH_STATE_TTL_SECONDS * 1_000
    ) {
      return { ok: false, reason: "expired" };
    }
    const expectedActor = actorBinding(
      input.secret,
      input.userId,
      input.sessionId,
    );
    if (!sameOpaqueValue(payload.actor, expectedActor)) {
      return { ok: false, reason: "actor_mismatch" };
    }
    if (safeGoogleOAuthReturnPath(payload.returnPath) !== payload.returnPath) {
      return { ok: false, reason: "return_path" };
    }
    return { ok: true, returnPath: payload.returnPath };
  } catch {
    return { ok: false, reason: "tampered" };
  }
}
