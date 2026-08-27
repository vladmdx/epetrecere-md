/**
 * Record an electronic acceptance ("semnătură electronică") of legal documents.
 *
 * Implements the technical fixation required by Venue Agreement Anexa 2: the
 * signer's identity, the exact document version, timestamp, email/phone, IP
 * and user-agent, plus a hash of the accepted text. The table is append-only
 * at the database level — enforced by the trigger installed in
 * migrations/manual/0017_legal_acceptances_evidence.sql, not merely asserted
 * here — so a signature can never be edited or deleted away.
 *
 * Both the signer AND every administrator are e-mailed the moment the
 * signature lands. The admin copy used to arrive only from the registration
 * routes, i.e. only if the partner went on to finish onboarding, and carried
 * just the PNG; an abandoned registration still produced a binding
 * acceptance with no record leaving the database.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, notifications, users, artists, venues } from "@/lib/db/schema";
import {
  LEGAL_PACK_VERSION,
  getLegalDocument,
  legalBlocks,
  legalTitle,
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
  if (!u) return NextResponse.json({ items: [], packVersion: LEGAL_PACK_VERSION });

  const rows = await db
    .select({
      id: legalAcceptances.id,
      subjectType: legalAcceptances.subjectType,
      documentSlug: legalAcceptances.documentSlug,
      documentVersion: legalAcceptances.documentVersion,
      packVersion: legalAcceptances.packVersion,
      locale: legalAcceptances.locale,
      signatureName: legalAcceptances.signatureName,
      signatureImage: legalAcceptances.signatureImage,
      representativeRole: legalAcceptances.representativeRole,
      acceptedAt: legalAcceptances.acceptedAt,
      ipAddress: legalAcceptances.ipAddress,
      userAgent: legalAcceptances.userAgent,
      email: legalAcceptances.email,
      phone: legalAcceptances.phone,
      contentHash: legalAcceptances.contentHash,
    })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.userId, u.id))
    .orderBy(desc(legalAcceptances.acceptedAt));

  // Name each document server-side: the settings page must not pull the whole
  // legal-pack JSON into the browser bundle just to print a title. The title
  // is resolved in the language the signer actually signed in.
  const items = rows.map((r) => {
    const doc = getLegalDocument(r.documentSlug);
    return {
      ...r,
      documentTitle: doc ? legalTitle(doc, r.locale) : r.documentSlug,
    };
  });
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

  // Link the signature to the vendor profile when one already exists. During
  // onboarding it does NOT: the profile is created only after this call
  // succeeds, deliberately, so nobody ends up live without a contract. The
  // ids are backfilled by register-artist / register-venue right afterwards.
  const [a] = subjectType === "artist"
    ? await db
        .select({ id: artists.id, name: artists.nameRo })
        .from(artists)
        .where(eq(artists.userId, u.id))
        .limit(1)
    : [];
  const [v] = subjectType === "venue"
    ? await db
        .select({ id: venues.id, name: venues.nameRo })
        .from(venues)
        .where(eq(venues.userId, u.id))
        .limit(1)
    : [];

  const locale = ["ro", "ru", "en"].includes(body.locale ?? "") ? body.locale! : "ro";
  const required =
    subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;
  const slugs = body.documents?.length ? body.documents : [...required];

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent");

  // One row per document, each carrying the hash of the exact text shown.
  const recordedDocs: {
    slug: string;
    title: string;
    version: string;
    contentHash: string;
  }[] = [];

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
    recordedDocs.push({
      slug: doc.slug,
      title: legalTitle(doc, locale),
      version: doc.version,
      contentHash,
    });
  }

  const recorded = recordedDocs.map((d) => d.slug);

  // Everything below is fire-and-forget: a mail failure must never undo a
  // recorded signature.
  if (recordedDocs.length > 0) {
    const acceptedAt = new Date();
    const subjectName = (subjectType === "venue" ? v?.name : a?.name) ?? null;

    void (async () => {
      const { sendEmail, dataUrlToAttachment } = await import("@/lib/email/send");
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
      const attachment = dataUrlToAttachment(signatureImage, "semnatura.png");

      // 1. The signer's own copy — Anexa 2 asks that the accepted version
      // stay available to them.
      if (u.email) {
        try {
          const { signedContractEmail } = await import(
            "@/lib/email/templates/signed-contract"
          );
          const { subject, html } = signedContractEmail({
            signerName: signatureName,
            subjectLabel:
              subjectType === "venue" ? "locația ta" : "profilul tău de artist",
            documents: recordedDocs.map((d) => ({
              title: d.title,
              version: d.version,
              url: `/legal/${d.slug}`,
            })),
            acceptedAt,
            ipAddress: ip,
            packVersion: LEGAL_PACK_VERSION,
            baseUrl,
            hasSignatureImage: Boolean(signatureImage),
          });
          await sendEmail({
            to: u.email,
            subject,
            html,
            attachments: attachment ? [attachment] : undefined,
          });
        } catch (err) {
          console.error("[legal] signer contract email failed", err);
        }
      }

      // 2. The administrators — every one of them, with the whole forensic
      // record, at signature time rather than at registration time.
      try {
        const { getAdminRecipients } = await import("@/lib/email/recipients");
        const { signedContractAdminEmail } = await import(
          "@/lib/email/templates/signed-contract-admin"
        );
        const admins = await getAdminRecipients();
        const { subject, html } = signedContractAdminEmail({
          signerName: signatureName,
          representativeRole: body.representativeRole ?? null,
          subjectType,
          subjectName,
          email: u.email,
          phone,
          documents: recordedDocs,
          packVersion: LEGAL_PACK_VERSION,
          locale,
          acceptedAt,
          ipAddress: ip,
          userAgent: ua,
          baseUrl,
          hasSignatureImage: Boolean(signatureImage),
        });

        for (const admin of admins) {
          await db
            .insert(notifications)
            .values({
              userId: admin.id,
              type: "legal_signed",
              title:
                subjectType === "venue"
                  ? "Contract semnat — sală"
                  : "Contract semnat — artist",
              message: `${signatureName} (${u.email}) a acceptat pachetul legal v${LEGAL_PACK_VERSION}.`,
              actionUrl: "/admin/contracte",
            })
            .catch((err) =>
              console.error("[legal] admin in-app notification failed", err),
            );
          if (admin.email) {
            await sendEmail({
              to: admin.email,
              subject,
              html,
              attachments: attachment ? [attachment] : undefined,
            }).catch((err) =>
              console.error("[legal] admin contract email failed", err),
            );
          }
        }
      } catch (err) {
        console.error("[legal] admin notification failed", err);
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
