import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { leads, offerRequests } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

// GET all leads for CRM
export async function GET() {
  const allLeads = await db
    .select()
    .from(leads)
    .orderBy(desc(leads.createdAt))
    .limit(200);

  return NextResponse.json(allLeads);
}

const createLeadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  phonePrefix: z.string().default("+373"),
  email: z.email().optional(),
  eventType: z.string().optional(),
  eventDate: z.string().optional(),
  location: z.string().optional(),
  guestCount: z.number().optional(),
  budget: z.number().optional(),
  message: z.string().optional(),
  source: z.enum(["form", "wizard", "direct"]).default("form"),
  artistId: z.number().optional(),
  venueId: z.number().optional(),
});

export async function POST(req: NextRequest) {
  // Rate limit: 10 submissions per minute per IP
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = rateLimit(`leads:${ip}`, 10, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json();

  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { artistId, venueId, ...leadData } = parsed.data;

  // 1. Create lead record
  const [lead] = await db
    .insert(leads)
    .values({
      ...leadData,
      status: "new",
      score: calculateScore(leadData),
    })
    .returning();

  // 2. Also create offerRequest for admin panel visibility
  try {
    await db.insert(offerRequests).values({
      artistId: artistId ?? null,
      venueId: venueId ?? null,
      clientName: leadData.name,
      clientPhone: `${leadData.phonePrefix || "+373"} ${leadData.phone}`,
      clientEmail: leadData.email ?? null,
      eventType: leadData.eventType ?? null,
      eventDate: leadData.eventDate ?? null,
      message: leadData.message ?? null,
      source: leadData.source ?? "form",
      status: "new",
    });
  } catch (e) {
    // Don't fail the lead creation if offerRequest fails
    console.error("Failed to create offer request:", e);
  }

  return NextResponse.json(lead, { status: 201 });
}

function calculateScore(data: { budget?: number; eventType?: string; source?: string }): number {
  let score = 10;
  if (data.budget) {
    if (data.budget > 5000) score += 30;
    else if (data.budget > 2000) score += 20;
    else if (data.budget > 500) score += 10;
  }
  if (data.eventType === "wedding") score += 20;
  if (data.source === "wizard") score += 15;
  return Math.min(score, 100);
}
