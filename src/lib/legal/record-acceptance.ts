/**
 * Atomic legal-pack acceptance. One session either lands completely, is
 * reused if it is already complete and coherent, or writes nothing.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  legalAcceptances,
  legalContractDeliveryOutbox,
  users,
} from "@/lib/db/schema";
import {
  LEGAL_PACK_VERSION,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
  getLegalDocument,
  legalBlocksFor,
  legalTitle,
  type PartnerIdentity,
} from "@/lib/legal";
import { missingCurrentDocuments } from "@/lib/legal/acceptance";
import { onboardingAgreementStatus } from "@/lib/legal/onboarding-agreement";
import { acquireLegalScopeLock } from "@/lib/booking/advisory-locks";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import {
  authorizeOrganizationCapability,
  getAppUserById,
} from "@/lib/venue-access";

type Executor = typeof db;

export type LegalAcceptanceValue = {
  userId: string;
  subjectType: "artist" | "venue";
  artistId: number | null;
  venueId: number | null;
  organizationId: number | null;
  documentSlug: string;
  documentVersion: string;
  packVersion: string;
  locale: "ro" | "ru" | "en";
  signatureName: string;
  signatureImage: string;
  representativeRole: string | null;
  documentTitle: string;
  documentBlocks: { type: string; text: string }[];
  deviceSummary: string | null;
  partnerType: string;
  legalName: string;
  idNumber: string;
  legalAddress: string;
  representativeName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  email: string | null;
  phone: string | null;
  acceptedAt: Date;
  contentHash: string;
  acceptanceSessionId: string;
};

export type RecordedLegalDoc = {
  slug: string;
  title: string;
  version: string;
  contentHash: string;
  acceptedAt: Date;
};

function requiredSlugs(subjectType: "artist" | "venue") {
  return subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;
}

function sessionIsComplete(rows: Array<typeof legalAcceptances.$inferSelect>, subjectType: "artist" | "venue") {
  return missingCurrentDocuments(rows, subjectType).length === 0;
}

export function buildAcceptanceValues(input: {
  userId: string;
  subjectType: "artist" | "venue";
  artistId: number | null;
  venueId: number | null;
  organizationId: number | null;
  locale: "ro" | "ru" | "en";
  signatureName: string;
  signatureImage: string;
  representativeRole?: string | null;
  identity: PartnerIdentity;
  ipAddress: string | null;
  userAgent: string | null;
  deviceSummary: string | null;
  email: string | null;
  phone: string | null;
  acceptedAt: Date;
  sessionId: string;
  slugs: readonly string[];
}): LegalAcceptanceValue[] {
  return input.slugs.map((slug) => {
    const doc = getLegalDocument(slug)!;
    const shown = legalBlocksFor(doc, input.locale, input.identity);
    return {
      userId: input.userId,
      subjectType: input.subjectType,
      artistId: input.artistId,
      venueId: input.venueId,
      organizationId: input.organizationId,
      documentSlug: slug,
      documentVersion: doc.version,
      packVersion: LEGAL_PACK_VERSION,
      locale: input.locale,
      signatureName: input.signatureName,
      signatureImage: input.signatureImage,
      representativeRole: input.representativeRole ?? null,
      documentTitle: legalTitle(doc, input.locale),
      documentBlocks: shown,
      deviceSummary: input.deviceSummary,
      partnerType: input.identity.partnerType,
      legalName: input.identity.legalName,
      idNumber: input.identity.idNumber ?? "",
      legalAddress: input.identity.legalAddress ?? "",
      representativeName: input.identity.representativeName ?? null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      email: input.email,
      phone: input.phone,
      acceptedAt: input.acceptedAt,
      contentHash: createHash("sha256").update(shown.map((b) => b.text).join("\n")).digest("hex"),
      acceptanceSessionId: input.sessionId,
    };
  });
}

async function loadScopeRows(
  executor: Executor,
  input: { userId: string; subjectType: "artist" | "venue"; organizationId: number | null },
) {
  if (input.organizationId) {
    return executor
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.organizationId, input.organizationId));
  }
  return executor
    .select()
    .from(legalAcceptances)
    .where(
      and(
        eq(legalAcceptances.userId, input.userId),
        eq(legalAcceptances.subjectType, input.subjectType),
        isNull(legalAcceptances.organizationId),
      ),
    );
}

function rowsForCurrentPack(rows: Array<typeof legalAcceptances.$inferSelect>) {
  return rows.filter((row) => row.packVersion === LEGAL_PACK_VERSION);
}

function groupBySession(rows: Array<typeof legalAcceptances.$inferSelect>) {
  const map = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.acceptanceSessionId;
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return [...map.values()].sort(
    (a, b) => new Date(b[0]!.acceptedAt).getTime() - new Date(a[0]!.acceptedAt).getTime(),
  );
}

function immutableConflict(
  existing: Array<typeof legalAcceptances.$inferSelect>,
  values: LegalAcceptanceValue[],
) {
  return values.some((value) =>
    existing.some(
      (row) =>
        row.documentSlug === value.documentSlug &&
        row.documentVersion === value.documentVersion &&
        row.packVersion === value.packVersion &&
        (row.contentHash !== value.contentHash ||
          row.signatureName !== value.signatureName ||
          row.signatureImage !== value.signatureImage ||
          row.representativeRole !== value.representativeRole ||
          row.locale !== value.locale ||
          row.partnerType !== value.partnerType ||
          row.legalName !== value.legalName ||
          row.idNumber !== value.idNumber ||
          row.legalAddress !== value.legalAddress ||
          row.representativeName !== value.representativeName),
    ),
  );
}

async function ensureDeliveryJobs(
  executor: Executor,
  session: Array<typeof legalAcceptances.$inferSelect>,
): Promise<void> {
  const first = session[0];
  if (!first) return;
  const [alreadyMaterialized] = await executor
    .select({ id: legalContractDeliveryOutbox.id })
    .from(legalContractDeliveryOutbox)
    .where(eq(legalContractDeliveryOutbox.acceptanceSessionId, first.acceptanceSessionId))
    .limit(1);
  if (alreadyMaterialized) return;

  const admins = await executor
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.role, ["admin", "super_admin"]));
  const recipients: Array<typeof legalContractDeliveryOutbox.$inferInsert> = [];
  if (first.email) {
    recipients.push({
      acceptanceSessionId: first.acceptanceSessionId,
      anchorAcceptanceId: first.id,
      channel: "signer",
      recipientKey: first.userId ?? `acceptance:${first.id}`,
      recipientEmail: first.email,
    });
  }
  for (const admin of admins) {
    if (!admin.email) continue;
    recipients.push({
      acceptanceSessionId: first.acceptanceSessionId,
      anchorAcceptanceId: first.id,
      channel: "admin",
      recipientKey: admin.id,
      recipientEmail: admin.email,
    });
  }
  if (!recipients.length) return;
  await executor
    .insert(legalContractDeliveryOutbox)
    .values(recipients)
    .onConflictDoNothing();
}

export async function recordLegalAcceptancePack(input: {
  userId: string;
  subjectType: "artist" | "venue";
  artistId: number | null;
  venueId: number | null;
  organizationId: number | null;
  locale: "ro" | "ru" | "en";
  signatureName: string;
  signatureImage: string;
  representativeRole?: string | null;
  identity: PartnerIdentity;
  ipAddress: string | null;
  userAgent: string | null;
  deviceSummary: string | null;
  email: string | null;
  phone: string | null;
  slugs: readonly string[];
}): Promise<
  | {
      ok: true;
      reused: boolean;
      sessionId: string;
      rows: Array<typeof legalAcceptances.$inferSelect>;
      recorded: RecordedLegalDoc[];
    }
  | { ok: false; status: number; error: string; code: string }
> {
  if (input.organizationId && input.subjectType !== "venue") {
    return {
      ok: false,
      status: 400,
      error: "organizationId is only valid for subjectType=venue",
      code: "ORGANIZATION_SUBJECT_REQUIRED",
    };
  }
  if (input.organizationId && !isMultiHallEnabled()) {
    return { ok: false, status: 404, error: "FEATURE_DISABLED", code: "FEATURE_DISABLED" };
  }

  const required = requiredSlugs(input.subjectType);
  if (
    input.slugs.length !== required.length ||
    required.some((slug) => !input.slugs.includes(slug))
  ) {
    return {
      ok: false,
      status: 400,
      error: "all_current_documents_required",
      code: "all_current_documents_required",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const executor = tx as unknown as Executor;
      await acquireLegalScopeLock(tx, {
        organizationId: input.organizationId,
        userId: input.userId,
      });

      let identity = input.identity;
      if (input.organizationId) {
        // The route-level check is only an early rejection. Membership can be
        // revoked while signature validation runs, so the authoritative check
        // happens after the same organization lock used by member mutations.
        const actor = await getAppUserById(input.userId, executor);
        if (!actor) {
          return {
            ok: false as const,
            status: 403,
            error: "Forbidden",
            code: "FORBIDDEN",
          };
        }
        const access = await authorizeOrganizationCapability(
          actor,
          input.organizationId,
          "manage_legal",
          executor,
        );
        if (!access.ok) {
          return {
            ok: false as const,
            status: access.status,
            error: access.error,
            code: "FORBIDDEN",
          };
        }

        const { resolveOrganizationSigningIdentity } = await import("@/lib/partner/legal");
        const resolved = await resolveOrganizationSigningIdentity(
          input.organizationId,
          input.identity,
          executor,
        );
        if (!resolved.ok) {
          return {
            ok: false as const,
            status: resolved.status,
            error: resolved.code,
            code: resolved.code,
          };
        }
        identity = resolved.identity;
      }

      const existing = await loadScopeRows(executor, input);
      const current = rowsForCurrentPack(existing);
      const sessions = groupBySession(current);
      const complete = sessions.find(
        (session) =>
          sessionIsComplete(session, input.subjectType) &&
          onboardingAgreementStatus(session, input.subjectType).status === "resumable",
      );
      if (complete) {
        if (immutableConflict(complete, buildAcceptanceValues({
          ...input,
          identity,
          acceptedAt: complete[0]!.acceptedAt,
          sessionId: complete[0]!.acceptanceSessionId,
          slugs: input.slugs,
        }))) {
          return {
            ok: false as const,
            status: 409,
            error: "signed_document_is_immutable",
            code: "signed_document_is_immutable",
          };
        }
        await ensureDeliveryJobs(executor, complete);
        const recorded = required.map((slug) => {
          const row = complete.find((item) => item.documentSlug === slug)!;
          return {
            slug: row.documentSlug,
            title: row.documentTitle ?? row.documentSlug,
            version: row.documentVersion,
            contentHash: row.contentHash ?? "",
            acceptedAt: row.acceptedAt,
          };
        });
        return {
          ok: true as const,
          reused: true,
          sessionId: complete[0]!.acceptanceSessionId,
          rows: complete,
          recorded,
        };
      }

      // Partial sessions remain immutable evidence. Because uniqueness is
      // session-scoped, append a fresh, complete canonical session instead of
      // trying to mutate/delete the failed attempt.
      const sessionId = randomUUID();
      const acceptedAt = new Date();
      const values = buildAcceptanceValues({
        ...input,
        identity,
        acceptedAt,
        sessionId,
        slugs: input.slugs,
      });
      const inserted = await executor.insert(legalAcceptances).values(values).returning();
      if (inserted.length !== values.length) {
        throw new Error("legal_session_insert_incomplete");
      }
      if (
        !sessionIsComplete(inserted, input.subjectType) ||
        onboardingAgreementStatus(inserted, input.subjectType).status !== "resumable"
      ) {
        throw new Error("legal_session_insert_incomplete");
      }
      await ensureDeliveryJobs(executor, inserted);
      const recorded = inserted.map((row) => ({
        slug: row.documentSlug,
        title: row.documentTitle ?? row.documentSlug,
        version: row.documentVersion,
        contentHash: row.contentHash ?? "",
        acceptedAt: row.acceptedAt,
      }));
      return {
        ok: true as const,
        reused: false,
        sessionId,
        rows: inserted,
        recorded,
      };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return {
        ok: false,
        status: 409,
        error: "signed_document_is_immutable",
        code: "signed_document_is_immutable",
      };
    }
    throw error;
  }
}
