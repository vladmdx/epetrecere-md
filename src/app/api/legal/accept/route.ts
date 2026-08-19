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
    /** Handwritten signature as a PNG data URL. */
    signatureImage?: string;
    representativeRole?: string;
    locale?: string;
    documents?: string[];
  };

  const subjectType = body.subjectType === "venue" ? "venue" : "artist";
  const signatureName = (body.signatureName ?? "").trim();
  // Only accept a real PNG data URL, and cap it: a signature is a few KB, so
  // anything large is either a mistake or an attempt to stuff the row.
  const rawImage = body.signatureImage ?? null;
  const signatureImage =
    typeof rawImage === "string" &&
    rawImage.startsWith("data:image/png;base64,") &&
    rawImage.length <= 400_000
      ? rawImage
      : null;
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
        signatureImage,
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

  // Send the signer their own copy of what they just accepted (Anexa 2 asks
  // that the accepted version be available to them). Non-blocking: an email
  // failure must not undo a recorded signature.
  if (recorded.length > 0 && u.email) {
    void (async () => {
      try {
        const { sendEmail, dataUrlToAttachment } = await import("@/lib/email/send");
        const { signedContractEmail } = await import(
          "@/lib/email/templates/signed-contract"
        );
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
        const docs = recorded
          .map((slug) => getLegalDocument(slug))
          .filter((d): d is NonNullable<typeof d> => Boolean(d))
          .map((d) => ({
            title: d.title.ro,
            version: d.version,
            url: `/legal/${d.slug}`,
          }));
        const { subject, html } = signedContractEmail({
          signerName: signatureName,
          subjectLabel: subjectType === "venue" ? "locația ta" : "profilul tău de artist",
          documents: docs,
          acceptedAt: new Date(),
          ipAddress: ip,
          packVersion: LEGAL_PACK_VERSION,
          baseUrl,
          hasSignatureImage: Boolean(signatureImage),
        });
        const attachment = dataUrlToAttachment(signatureImage, "semnatura.png");
        await sendEmail({
          to: u.email,
          subject,
          html,
          attachments: attachment ? [attachment] : undefined,
        });
      } catch (err) {
        console.error("[legal] signed-contract email failed", err);
      }
    })();
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
