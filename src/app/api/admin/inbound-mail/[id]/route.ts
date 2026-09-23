import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { inboundEmailArchive } from "@/lib/db/schema";
import { isResendEmailId } from "@/lib/email/inbound-archive";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { id } = await context.params;
  if (!isResendEmailId(id)) return new NextResponse("Not found", { status: 404 });
  const [email] = await db.select({ blobPath: inboundEmailArchive.blobPath, byteLength: inboundEmailArchive.byteLength })
    .from(inboundEmailArchive).where(eq(inboundEmailArchive.emailId, id)).limit(1);
  if (!email) return new NextResponse("Not found", { status: 404 });
  const token = process.env.MOMENTS_BLOB_READ_WRITE_TOKEN;
  if (!token) return new NextResponse("Archive unavailable", { status: 503 });
  const stored = await get(email.blobPath, { token, access: "private", useCache: false });
  if (!stored || stored.statusCode !== 200 || stored.blob.size !== email.byteLength) {
    return new NextResponse("Archive unavailable", { status: 503 });
  }
  return new NextResponse(stored.stream, {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `attachment; filename="${id}.eml"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
