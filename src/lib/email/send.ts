import { Resend } from "resend";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailOptions) {
  const from = process.env.EMAIL_FROM || "ePetrecere.md <noreply@epetrecere.md>";

  return getResend().emails.send({
    from,
    to,
    subject,
    html,
    replyTo,
  });
}
