import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { inboundEmailArchive } from "@/lib/db/schema";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const messages = await db.select({
    emailId: inboundEmailArchive.emailId,
    receivedAt: inboundEmailArchive.receivedAt,
    fromAddress: inboundEmailArchive.fromAddress,
    recipients: inboundEmailArchive.recipients,
    subject: inboundEmailArchive.subject,
    byteLength: inboundEmailArchive.byteLength,
  }).from(inboundEmailArchive).orderBy(desc(inboundEmailArchive.receivedAt)).limit(100);
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "private, no-store" } });
}
