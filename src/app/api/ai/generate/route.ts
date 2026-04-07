import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { generateArtistDescription, generateSEOTexts } from "@/lib/ai";

const generateSchema = z.object({
  type: z.enum(["description", "seo"]),
  name: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
  entityType: z.enum(["artist", "venue"]).optional(),
  language: z.enum(["ro", "ru", "en"]).default("ro"),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = generateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
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
  } catch {
    return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
  }
}
