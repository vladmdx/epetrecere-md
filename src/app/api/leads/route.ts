import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";

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

export async function POST(req: Request) {
  const body = await req.json();

  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { artistId, venueId, ...leadData } = parsed.data;

  const [lead] = await db
    .insert(leads)
    .values({
      ...leadData,
      status: "new",
      score: calculateScore(leadData),
    })
    .returning();

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
