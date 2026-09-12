// AI-generate (or AI-improve) a venue's long description. Returns HTML so
// the TipTap editor can load it directly. Owner-gated + rate-limited.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { generateVenueDescription } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";
import { requireVenueCapability } from "@/lib/venue-access";

const schema = z.object({
  venueId: z.number().int().positive(),
  lang: z.enum(["ro", "ru", "en"]).default("ro"),
  mode: z.enum(["generate", "improve"]).default("generate"),
  current: z.string().max(20_000).optional(),
});

export async function POST(req: NextRequest) {
  // AI calls are expensive — cap per-IP at 10/min to prevent runaway usage.
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`ai-venue-desc:${ip}`, 10, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Prea multe cereri" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const access = await requireVenueCapability(parsed.data.venueId, "manage_ai");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, parsed.data.venueId))
    .limit(1);
  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const name =
    parsed.data.lang === "ru"
      ? venue.nameRu || venue.nameRo
      : parsed.data.lang === "en"
        ? venue.nameEn || venue.nameRo
        : venue.nameRo;

  try {
    const description = await generateVenueDescription({
      name,
      city: venue.city,
      capacityMin: venue.capacityMin,
      capacityMax: venue.capacityMax,
      facilities: venue.facilities ?? [],
      current: parsed.data.current,
      mode: parsed.data.mode,
      language: parsed.data.lang,
    });
    return NextResponse.json({ description });
  } catch (err) {
    console.error("venue-description error", err);
    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 503 },
    );
  }
}
