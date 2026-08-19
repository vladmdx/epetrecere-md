/**
 * Record an electronic acceptance ("semnătură electronică") of legal documents.
 *
 * Implements the technical fixation required by Venue Agreement Anexa 2: the
 * signer's identity, the exact document version, timestamp, email/phone, IP
 * and user-agent, plus a hash of the accepted text. The table is append-only
 * at the database level, so a signature can never be edited away.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, users, artists, venues } from "@/lib/db/schema";
import {
  LEGAL_PACK_VERSION,
  getLegalDocument,
  legalBlocks,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
} from "@/lib/legal";

export const dynamic = "force-dynamic";

/** Best-effort client IP behind Vercel's proxy. */
function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!u) return NextResponse.json({ items: [] });

  const items = await db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.userId, u.id))
    .orderBy(desc(legalAcceptances.acceptedAt));
  return NextResponse.json({ items, packVersion: LEGAL_PACK_VERSION });
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    subjectType?: "artist" | "venue";
    signatureName?: string;
    representativeRole?: string;
    locale?: string;
    documents?: string[];
  };

  const subjectType = body.subjectType === "venue" ? "venue" : "artist";
  const signatureName = (body.signatureName ?? "").trim();
  if (signatureName.length < 3) {
    return NextResponse.json(
      { error: "signature_name_required" },
      { status: 400 },
    );
  }

  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!u) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const cu = await currentUser();
  const phone = cu?.phoneNumbers?.[0]?.phoneNumber ?? null;

  // Link the signature to the vendor profile when one already exists.
  const [a] = subjectType === "artist"
    ? await db.select({ id: artists.id }).from(artists).where(eq(artists.userId, u.id)).limit(1)
    : [];
  const [v] = subjectType === "venue"
    ? await db.select({ id: venues.id }).from(venues).where(eq(venues.userId, u.id)).limit(1)
    : [];

  const locale = ["ro", "ru", "en"].includes(body.locale ?? "") ? body.locale! : "ro";
  const required =
    subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;
  const slugs = body.documents?.length ? body.documents : [...required];

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent");

  const recorded: string[] = [];
  for (const slug of slugs) {
    const doc = getLegalDocument(slug);
    if (!doc) continue;
    // Hash exactly what the signer was shown, so later edits are detectable.
    const text = legalBlocks(doc, locale).map((b) => b.text).join("\n");
    const contentHash = createHash("sha256").update(text).digest("hex");

    await db
      .insert(legalAcceptances)
      .values({
        userId: u.id,
        subjectType,
        artistId: a?.id ?? null,
        venueId: v?.id ?? null,
        documentSlug: doc.slug,
        documentVersion: doc.version,
        packVersion: LEGAL_PACK_VERSION,
        locale,
        signatureName,
        representativeRole: body.representativeRole ?? null,
        ipAddress: ip,
        userAgent: ua,
        email: u.email,
        phone,
        contentHash,
      })
      // Re-signing the same version is a no-op rather than an error; the
      // original signature (and its timestamp) is what counts.
      .onConflictDoNothing();
    recorded.push(doc.slug);
  }

  return NextResponse.json({ success: true, recorded, packVersion: LEGAL_PACK_VERSION });
}

/** Which required documents this user has NOT yet signed. */
export async function PUT(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { subjectType?: "artist" | "venue" };
  const subjectType = body.subjectType === "venue" ? "venue" : "artist";

  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!u) return NextResponse.json({ missing: [] });

  const signed = await db
    .select({ slug: legalAcceptances.documentSlug })
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.userId, u.id),
        eq(legalAcceptances.subjectType, subjectType),
      ),
    );
  const have = new Set(signed.map((s) => s.slug));
  const required = subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;
  return NextResponse.json({ missing: required.filter((s) => !have.has(s)) });
}
