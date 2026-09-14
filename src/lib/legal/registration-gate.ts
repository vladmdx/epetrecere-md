import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances } from "@/lib/db/schema";
import { PARTNER_REQUIRED_DOCS, VENUE_REQUIRED_DOCS } from "@/lib/legal";
import { onboardingAgreementStatus } from "./onboarding-agreement";

export async function missingRegistrationDocuments(
  userId: string,
  subjectType: "artist" | "venue",
  executor: typeof db = db,
) {
  const rows = await executor.select().from(legalAcceptances).where(and(
    eq(legalAcceptances.userId, userId),
    eq(legalAcceptances.subjectType, subjectType),
    // This helper guards the personal/legacy registration flows. An
    // organization-scoped signature belongs only to that legal holder and
    // must never satisfy a later personal artist/Venue registration.
    isNull(legalAcceptances.organizationId),
  ));
  // Presence alone is insufficient: legacy rows may contain values accepted
  // before the current identity rules. Registration needs one complete,
  // coherent and currently valid signing session.
  if (onboardingAgreementStatus(rows, subjectType).status === "resumable") return [];
  return [...(subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS)];
}
