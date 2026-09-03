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

import { NextResponse, after, type NextRequest } from "next/server";
import { isIP } from "node:net";
import { acceptanceSchema } from "@/lib/legal/acceptance";
import { validSignatureImage } from "@/lib/legal/signature-image";
import { missingRegistrationDocuments } from "@/lib/legal/registration-gate";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import { describeDevice } from "@/lib/legal/device";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances, notifications, users, artists, venues } from "@/lib/db/schema";
import {
  LEGAL_PACK_VERSION,
  getLegalDocument,
  legalBlocksFor,
  legalTitle,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
} from "@/lib/legal";

export const dynamic = "force-dynamic";

/** Best-effort client IP behind Vercel's proxy. */
function clientIp(req: NextRequest): string | null {
  // Trust the deployment proxy, not arbitrary caller-supplied headers locally.
  if (!process.env.VERCEL) return null;
  const value = (req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-forwarded-for"))?.split(",")[0]?.trim();
  return value && isIP(value) ? value : null;
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
      // The frozen copy, so a partner re-reads what they signed rather than
      // whatever the pack says today.
      documentTitleStored: legalAcceptances.documentTitle,
      documentBlocks: legalAcceptances.documentBlocks,
      deviceSummary: legalAcceptances.deviceSummary,
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
  return NextResponse.json({ items, packVersion: LEGAL_PACK_VERSION }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = acceptanceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({
    error: "invalid_contract_acceptance",
    details: parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message })),
  }, { status: 400 });
  const body = parsed.data;
  const { subjectType, signatureName, signatureImage, identity } = body;
  if (!await validSignatureImage(signatureImage)) {
    return NextResponse.json({ error: "valid_handwritten_signature_required" }, { status: 400 });
  }

  const cu = await currentUser();
  if (!cu?.primaryEmailAddress || cu.primaryEmailAddress.verification?.status !== "verified") {
    return NextResponse.json({ error: "verified_email_required" }, { status: 403 });
  }
  let [u] = await db
    .select({ id: users.id, email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!u) {
    await db.insert(users).values({ clerkId, email: cu.primaryEmailAddress.emailAddress,
      name: [cu.firstName, cu.lastName].filter(Boolean).join(" ") || null,
      phone: cu.phoneNumbers[0]?.phoneNumber ?? null, role: "user",
    }).onConflictDoNothing();
    [u] = await db.select({ id: users.id, email: users.email, phone: users.phone })
      .from(users).where(eq(users.clerkId, clerkId)).limit(1);
  }
  if (!u) return NextResponse.json({ error: "account_sync_required" }, { status: 409 });
  const phone = u.phone ?? cu.phoneNumbers?.[0]?.phoneNumber ?? null;

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

  const locale = body.locale;
  const slugs = body.documents;
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent")?.slice(0, 1000) ?? null;
  const device = describeDevice(ua, req.headers.get("x-client"));
  const acceptedAt = new Date();
  const values = slugs.map(slug => {
    const doc = getLegalDocument(slug)!;
    const shown = legalBlocksFor(doc, locale, identity);
    return {
      userId: u.id, subjectType, artistId: a?.id ?? null, venueId: v?.id ?? null,
      documentSlug: slug, documentVersion: doc.version, packVersion: LEGAL_PACK_VERSION,
      locale, signatureName, signatureImage, representativeRole: body.representativeRole ?? null,
      documentTitle: legalTitle(doc, locale), documentBlocks: shown, deviceSummary: device,
      ...identity, ipAddress: ip, userAgent: ua, email: u.email, phone, acceptedAt,
      contentHash: createHash("sha256").update(shown.map(b => b.text).join("\n")).digest("hex"),
    };
  });
  const previous = await db.select().from(legalAcceptances).where(and(
    eq(legalAcceptances.userId, u.id), eq(legalAcceptances.subjectType, subjectType),
  ));
  // A retry may reuse the same immutable acceptance, never silently substitute
  // a different party, language or document underneath an existing signature.
  if (values.some(v => previous.some(p => p.documentSlug === v.documentSlug &&
      p.documentVersion === v.documentVersion &&
      (p.contentHash !== v.contentHash || p.signatureName !== signatureName)))) {
    return NextResponse.json({ error: "signed_document_is_immutable" }, { status: 409 });
  }
  // All documents are inserted by ONE statement: either the whole pack lands
  // or none of it does. Existing signatures remain append-only.
  const inserted = await db.insert(legalAcceptances).values(values).onConflictDoNothing().returning();
  const recordedDocs = inserted.map(r => ({
    slug: r.documentSlug, title: r.documentTitle!, version: r.documentVersion,
    contentHash: r.contentHash!, acceptedAt: r.acceptedAt,
  }));

  const recorded = recordedDocs.map((d) => d.slug);

  // The dashboard reads the durable acceptance itself. Emails run with Next
  // after(), which keeps serverless work alive after the HTTP response.
  if (recordedDocs.length > 0) {
    // The stored timestamp, not a fresh one: this value is printed in the
    // signer's copy and the admin mail as the moment of acceptance, and it
    // has to be the moment the row actually records.
    const acceptedAt = recordedDocs[0].acceptedAt;
    const subjectName = (subjectType === "venue" ? v?.name : a?.name) ?? null;

    const { getAdminRecipients } = await import("@/lib/email/recipients");
    const recipients = await getAdminRecipients();
    if (recipients.length) await db.insert(notifications).values(recipients.map(admin => ({
      userId: admin.id, type: "legal_signed",
      title: subjectType === "venue" ? "Contract semnat - sală" : "Contract semnat - partener",
      message: signatureName + " a acceptat pachetul legal v" + LEGAL_PACK_VERSION + ".",
      actionUrl: "/admin/contracte",
    }))).catch(err => console.error("[legal] in-app notification failed", err));
    after(async () => {
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
              url: subjectType === "venue" ? "/dashboard/sala/setari" : "/dashboard/setari",
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
    });
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
  const required = subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;
  const missing = u ? await missingRegistrationDocuments(u.id, subjectType) : [...required];
  return NextResponse.json({ missing, packVersion: LEGAL_PACK_VERSION });
}
