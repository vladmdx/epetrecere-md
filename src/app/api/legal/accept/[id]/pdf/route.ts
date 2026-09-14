import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, users } from "@/lib/db/schema";
import {
  generateSignedContractPdf,
  SignedContractPdfError,
  signedContractPdfFilename,
} from "@/lib/legal/signed-contract-pdf";
import { canViewLegalAcceptance } from "@/lib/legal/acceptance-access";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const [[viewer], [anchor]] = await Promise.all([
    db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1),
    db.select().from(legalAcceptances).where(eq(legalAcceptances.id, id)).limit(1),
  ]);
  if (!viewer || !anchor) {
    // Deliberately hide whether another account's signed contract exists.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const allowed = await canViewLegalAcceptance(
    {
      id: viewer.id,
      role: viewer.role,
      isGlobalAdmin: viewer.role === "admin" || viewer.role === "super_admin",
    },
    anchor,
  );
  if (!allowed) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = await db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.acceptanceSessionId, anchor.acceptanceSessionId));

  try {
    const pdf = await generateSignedContractPdf(session);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${signedContractPdfFilename(anchor)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof SignedContractPdfError) {
      return NextResponse.json({ error: error.code }, { status: 410 });
    }
    console.error(
      "[legal] signed contract PDF failed",
      safeServerErrorLog(error, {
        correlationId: createServerLogCorrelationId(),
      }),
    );
    return NextResponse.json({ error: "pdf_generation_failed" }, { status: 500 });
  }
}
