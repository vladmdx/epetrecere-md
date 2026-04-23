// AI-generated SEO title + meta description for a venue.
//
// Owner-gated: only the signed-in owner of the target venue may call this.
// Loads the venue's name + description (per requested language) and asks
// Claude for { title, description } in that language. Does NOT persist —
// the client pre-fills the form and the owner must still hit Save.

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import { generateSEOTexts } from "@/lib/ai";

const schema = z.object({
  venueId: z.number().int().positive(),
  lang: z.enum(["ro", "ru", "en"]).default("ro"),
});

export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, parsed.data.venueId))
    .limit(1);
  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (venue.userId !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lang = parsed.data.lang;
  const name =
    lang === "ru"
      ? venue.nameRu || venue.nameRo
      : lang === "en"
        ? venue.nameEn || venue.nameRo
        : venue.nameRo;
  const descriptionHtml =
    lang === "ru"
      ? venue.descriptionRu || venue.descriptionRo
      : lang === "en"
        ? venue.descriptionEn || venue.descriptionRo
        : venue.descriptionRo;
  // Strip HTML tags for the AI prompt — we only feed plain text.
  const descriptionText = (descriptionHtml || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Compose a context-rich description so the AI has the city + capacity signals
  const contextParts: string[] = [];
  if (venue.city) contextParts.push(`Locație: ${venue.city}`);
  if (venue.capacityMin || venue.capacityMax) {
    contextParts.push(
      `Capacitate: ${venue.capacityMin ?? "?"}–${venue.capacityMax ?? "?"} persoane`,
    );
  }
  if (descriptionText) contextParts.push(descriptionText.slice(0, 800));

  try {
    const result = await generateSEOTexts(
      name || "Sală evenimente",
      "venue",
      contextParts.join(". "),
      lang,
    );
    return NextResponse.json({
      title: result.title,
      description: result.metaDescription,
    });
  } catch (err) {
    console.error("venue-seo error", err);
    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 503 },
    );
  }
}
