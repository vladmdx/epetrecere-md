import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, users } from "@/lib/db/schema";
import {
  generateSignedContractPdf,
  SignedContractPdfError,
  signedContractPdfFilename,
  signedContractSessionKey,
} from "@/lib/legal/signed-contract-pdf";

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
  const isAdmin = viewer?.role === "admin" || viewer?.role === "super_admin";
  if (!viewer || !anchor || (anchor.userId !== viewer.id && !isAdmin)) {
    // Deliberately hide whether another account's signed contract exists.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const candidates = await db
    .select()
    .from(legalAcceptances)
    .where(
      anchor.userId
        ? and(
            eq(legalAcceptances.userId, anchor.userId),
            eq(legalAcceptances.subjectType, anchor.subjectType),
            eq(legalAcceptances.acceptedAt, anchor.acceptedAt),
          )
        : and(
            isNull(legalAcceptances.userId),
            eq(legalAcceptances.subjectType, anchor.subjectType),
            eq(legalAcceptances.signatureName, anchor.signatureName),
            eq(legalAcceptances.acceptedAt, anchor.acceptedAt),
          ),
    );
  const sessionKey = signedContractSessionKey(anchor);
  const session = candidates.filter((row) => signedContractSessionKey(row) === sessionKey);

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
    console.error("[legal] signed contract PDF failed", error);
    return NextResponse.json({ error: "pdf_generation_failed" }, { status: 500 });
  }
}
