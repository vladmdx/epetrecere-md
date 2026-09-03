import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalAcceptances } from "@/lib/db/schema";
import { missingCurrentDocuments } from "./acceptance";

export async function missingRegistrationDocuments(userId: string, subjectType: "artist" | "venue") {
  const rows = await db.select().from(legalAcceptances).where(and(
    eq(legalAcceptances.userId, userId), eq(legalAcceptances.subjectType, subjectType),
  ));
  return missingCurrentDocuments(rows, subjectType);
}
