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
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  attachments,
}: SendEmailOptions) {
  const from = process.env.EMAIL_FROM || "ePetrecere.md <noreply@epetrecere.md>";

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
  });
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
