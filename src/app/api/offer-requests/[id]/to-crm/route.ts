import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { offerRequests, leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

// POST — send offer request to CRM (creates a lead from the offer request)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { id } = await params;

  // Get the offer request
  const [request] = await db
    .select()
    .from(offerRequests)
    .where(eq(offerRequests.id, Number(id)))
    .limit(1);

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check if lead already exists with this phone/email to avoid duplicates
  // Create lead for CRM
  const [lead] = await db
    .insert(leads)
    .values({
      name: request.clientName,
      phone: request.clientPhone,
      email: request.clientEmail,
      eventType: request.eventType,
      eventDate: request.eventDate,
      message: request.message,
      source: "form",
      status: "new",
      score: 50,
    })
    .returning();

  // Mark offer request as sent to CRM
  await db
    .update(offerRequests)
    .set({ status: "in_crm", adminSeen: true })
    .where(eq(offerRequests.id, Number(id)));

  return NextResponse.json({ success: true, leadId: lead.id });
}
