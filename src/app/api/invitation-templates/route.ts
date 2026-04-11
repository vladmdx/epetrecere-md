// Public read-only list of invitation templates.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invitationTemplates } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select()
    .from(invitationTemplates)
    .where(eq(invitationTemplates.isActive, true))
    .orderBy(asc(invitationTemplates.sortOrder));
  return NextResponse.json(rows);
}
