import { Resend } from "resend";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export interface EmailAttachment {
  filename: string;
  /** Base64 payload WITHOUT the data-URL prefix. */
  content: string;
  contentType?: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** Resend keeps the first successful request for this stable key. */
  idempotencyKey?: string;
  /** Cancels the provider HTTP request when the caller's lease expires. */
  signal?: AbortSignal;
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  attachments,
  idempotencyKey,
  signal,
}: SendEmailOptions) {
  const from = process.env.EMAIL_FROM || "ePetrecere.md <noreply@epetrecere.md>";

  const requestOptions = {
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(signal ? { signal } : {}),
  };
  return getResend().emails.send({
    from,
    to,
    subject,
    html,
    replyTo,
    ...(attachments?.length
      ? {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            ...(a.contentType ? { contentType: a.contentType } : {}),
          })),
        }
      : {}),
    // Resend 6.x forwards request options to native fetch. Its public type
    // omits RequestInit.signal, so keep this structural cast isolated here.
  }, requestOptions as Parameters<
    ReturnType<typeof getResend>["emails"]["send"]
  >[1]);
}

/** Turn a PNG data URL into an attachment Resend accepts. */
export function dataUrlToAttachment(
  dataUrl: string | null | undefined,
  filename: string,
): EmailAttachment | null {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return null;
  return {
    filename,
    content: dataUrl.slice("data:image/png;base64,".length),
    contentType: "image/png",
  };
}

/** Turn generated binary content into the base64 payload Resend expects. */
export function bytesToAttachment(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): EmailAttachment {
  return {
    filename,
    content: Buffer.from(bytes).toString("base64"),
    contentType,
  };
}
