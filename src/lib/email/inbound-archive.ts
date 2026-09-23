import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { inboundEmailArchive } from "@/lib/db/schema";

const MAX_RAW_BYTES = 40 * 1024 * 1024;
const EMAIL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isResendEmailId(id: string): boolean {
  return EMAIL_ID_RE.test(id);
}

async function downloadRaw(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port
    || parsed.hostname === "localhost" || parsed.hostname.endsWith(".local")) {
    throw new Error("Inbound raw URL is invalid");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!response.ok || !response.body) throw new Error("Inbound raw download failed");
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_RAW_BYTES) throw new Error("Inbound raw message exceeds limit");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RAW_BYTES) throw new Error("Inbound raw message exceeds limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (size === 0) throw new Error("Inbound raw message is empty");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

/** A successful return means the complete message, including attachments, is durable. */
export async function archiveInboundEmail(emailId: string): Promise<void> {
  if (!isResendEmailId(emailId)) throw new Error("Invalid inbound email ID");
  const [existing] = await db.select({ emailId: inboundEmailArchive.emailId })
    .from(inboundEmailArchive).where(eq(inboundEmailArchive.emailId, emailId)).limit(1);
  if (existing) return;

  const resendKey = process.env.RESEND_API_KEY;
  const blobToken = process.env.MOMENTS_BLOB_READ_WRITE_TOKEN;
  if (!resendKey || !blobToken) throw new Error("Inbound archive is not configured");
  const resend = new Resend(resendKey);
  const { data: email, error } = await resend.emails.receiving.get(emailId, { html_format: "cid" });
  if (error || !email || !email.raw?.download_url) {
    throw new Error("Resend did not provide the complete raw message");
  }
  const receivedAt = new Date(email.created_at);
  if (Number.isNaN(receivedAt.getTime())) throw new Error("Inbound date is invalid");
  const raw = await downloadRaw(email.raw.download_url);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const blobPath = `inbound-mail/${emailId}.eml`;
  const stored = await put(blobPath, raw, {
    access: "private",
    token: blobToken,
    contentType: "message/rfc822",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  if (new URL(stored.url).pathname !== `/${blobPath}`
    || !new URL(stored.url).hostname.endsWith(".private.blob.vercel-storage.com")) {
    throw new Error("Inbound private storage confirmation failed");
  }
  await db.insert(inboundEmailArchive).values({
    emailId,
    receivedAt,
    fromAddress: email.from,
    recipients: email.received_for.length ? email.received_for : email.to,
    subject: email.subject,
    messageId: email.message_id,
    blobPath,
    byteLength: raw.byteLength,
    sha256,
  }).onConflictDoNothing();
}
