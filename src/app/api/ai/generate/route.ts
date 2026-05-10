import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { generateArtistDescription, generateArtistDescriptionFromScratch, generateSEOTexts } from "@/lib/ai";

const generateSchema = z.object({
  type: z.enum(["description", "generate-description", "seo"]),
  name: z.string(),
  category: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  entityType: z.enum(["artist", "venue"]).optional(),
  language: z.enum(["ro", "ru", "en"]).default("ro"),
});

export async function POST(req: Request) {
  // Auth gate — only authenticated users (vendors, admins) may generate AI content
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = generateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    if (parsed.data.type === "generate-description") {
      const result = await generateArtistDescriptionFromScratch(
        parsed.data.name,
        parsed.data.category || "artist",
        parsed.data.location || "",
        parsed.data.language,
      );
      return NextResponse.json({ result });
    }

    if (parsed.data.type === "description") {
      const result = await generateArtistDescription(
        parsed.data.name,
        parsed.data.category || "artist",
        parsed.data.description || "",
        parsed.data.language,
      );
      return NextResponse.json({ result });
    }

    if (parsed.data.type === "seo") {
      const result = await generateSEOTexts(
        parsed.data.name,
        parsed.data.entityType || "artist",
        parsed.data.description || "",
        parsed.data.language,
      );
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err) {
    // Surface the underlying reason so the partner gets an actionable
    // toast instead of a generic "AI indisponibil". Logged in full for
    // server-side debugging.
    console.error("[ai/generate] error:", err);
    const message = err instanceof Error ? err.message : "AI service unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
