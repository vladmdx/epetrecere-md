import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const GUEST_LIST_FIELDS = [
  "fullName", "phone", "email", "group", "contactValue", "dietary", "notes",
] as const;
const INVITATION_GUEST_FIELDS = [
  "name", "email", "phone", "whatsapp", "group", "plusOneName", "dietaryNotes", "message",
] as const;

function key(): Buffer {
  const raw = process.env.GUEST_DATA_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("GUEST_DATA_ENCRYPTION_KEY is not configured");
  const decoded = Buffer.from(raw, "base64url");
  if (decoded.length !== 32) {
    throw new Error("GUEST_DATA_ENCRYPTION_KEY must be a 32-byte base64url key");
  }
  return decoded;
}

export function encryptGuestValue(value: string | null | undefined) {
  if (!value) return value;
  // An encrypted-looking value is accepted only if its authentication tag
  // validates. This prevents a legitimate note starting with `enc:v1:` from
  // becoming permanently unreadable by being mistaken for ciphertext.
  if (value.startsWith(PREFIX)) {
    decryptGuestValue(value);
    return value;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, body]).toString("base64url")}`;
}

export function decryptGuestValue(value: string | null | undefined) {
  if (!value || !value.startsWith(PREFIX)) return value;
  const packed = Buffer.from(value.slice(PREFIX.length), "base64url");
  if (packed.length < 29) throw new Error("Invalid encrypted guest value");
  const decipher = createDecipheriv("aes-256-gcm", key(), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([
    decipher.update(packed.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

function mapFields<T extends Record<string, unknown>>(
  row: T,
  fields: readonly string[],
  transform: (value: string | null | undefined) => string | null | undefined,
): T {
  const copy = { ...row };
  for (const field of fields) {
    const value = copy[field];
    if (typeof value === "string" || value == null) {
      (copy as Record<string, unknown>)[field] = transform(value as string | null | undefined);
    }
  }
  return copy;
}

export const protectGuestListRecord = <T extends Record<string, unknown>>(row: T) =>
  mapFields(row, GUEST_LIST_FIELDS, encryptGuestValue);
export const revealGuestListRecord = <T extends Record<string, unknown>>(row: T) =>
  mapFields(row, GUEST_LIST_FIELDS, decryptGuestValue);
export const protectInvitationGuestRecord = <T extends Record<string, unknown>>(row: T) =>
  mapFields(row, INVITATION_GUEST_FIELDS, encryptGuestValue);
export const revealInvitationGuestRecord = <T extends Record<string, unknown>>(row: T) =>
  mapFields(row, INVITATION_GUEST_FIELDS, decryptGuestValue);
