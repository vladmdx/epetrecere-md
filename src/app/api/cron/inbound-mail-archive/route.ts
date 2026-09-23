import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { inboundEmailArchive } from "@/lib/db/schema";
import { archiveInboundEmail } from "@/lib/email/inbound-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily reconciliation catches missed webhooks before Resend's retention expires. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Cron unavailable", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!process.env.RESEND_API_KEY) return new NextResponse("Resend unavailable", { status: 503 });
  const resend = new Resend(process.env.RESEND_API_KEY);
  const ids: string[] = [];
  let after: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const result = await resend.emails.receiving.list({ limit: 100, ...(after ? { after } : {}) });
    if (result.error || !result.data) return new NextResponse("Resend unavailable", { status: 503 });
    ids.push(...result.data.data.map((message) => message.id));
    if (!result.data.has_more || result.data.data.length === 0) break;
    after = result.data.data.at(-1)?.id;
  }
  if (ids.length === 0) return NextResponse.json({ checked: 0, archived: 0 });
  const existing = await db.select({ emailId: inboundEmailArchive.emailId })
    .from(inboundEmailArchive).where(inArray(inboundEmailArchive.emailId, ids));
  const archived = new Set(existing.map((row) => row.emailId));
  const missing = ids.filter((id) => !archived.has(id));
  let completed = 0;
  for (const id of missing.reverse().slice(0, 5)) {
    try {
      await archiveInboundEmail(id);
      completed += 1;
    } catch {
      console.error("[inbound-mail-cron] archiving failed", { emailId: id });
    }
  }
  return NextResponse.json(
    { checked: ids.length, missing: missing.length, archived: completed },
    { status: completed < Math.min(missing.length, 5) ? 503 : 200 },
  );
}
