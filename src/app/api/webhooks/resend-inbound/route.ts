import { NextResponse } from "next/server";
import { Resend } from "resend";
import { archiveInboundEmail } from "@/lib/email/inbound-archive";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Webhook unavailable", { status: 503 });
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return new NextResponse("Invalid webhook", { status: 400 });

  let event;
  try {
    const payload = await req.text();
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    });
  } catch {
    return new NextResponse("Invalid webhook", { status: 400 });
  }
  if (event.type !== "email.received") return NextResponse.json({ ok: true });
  try {
    await archiveInboundEmail(event.data.email_id);
    return NextResponse.json({ ok: true });
  } catch {
    // Resend retries non-2xx deliveries. Do not log the email body or headers.
    console.error("[resend-inbound] archiving failed", { emailId: event.data.email_id });
    return new NextResponse("Archive temporarily unavailable", { status: 503 });
  }
}
