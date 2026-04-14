import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import { notificationEmail } from "@/lib/email/templates/notification-email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const { subject, body } = await req.json();

  if (!subject || !body) {
    return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
  }

  const [lead] = await db
    .select({ email: leads.email, name: leads.name })
    .from(leads)
    .where(eq(leads.id, Number(id)))
    .limit(1);

  if (!lead?.email) {
    return NextResponse.json({ error: "Lead has no email" }, { status: 400 });
  }

  await sendEmail({
    to: lead.email,
    subject,
    html: notificationEmail({
      title: subject,
      message: body.replace(/\n/g, "<br>"),
      ctaUrl: "https://epetrecere.md",
      ctaText: "Vizitează ePetrecere.md",
    }),
  });

  return NextResponse.json({ ok: true });
}
