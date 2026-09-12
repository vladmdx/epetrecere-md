import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { rateLimit } from "@/lib/rate-limit";
import { requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { getAiClient } from "@/lib/ai/provider";

const schema = z.object({
  venueId: z.number().int().positive(),
  hallId: z.number().int().positive().optional(),
  sourceLanguage: z.enum(["ro", "ru", "en"]).default("ro"),
  fields: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 12),
});

const MAX_LEN = 4000;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`translate-fields:${ip}`, 8, 60_000);
  if (!success) return jsonError("Too many requests", 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Validation failed", 400, { details: parsed.error.issues });
  const access = await requireVenueCapability(parsed.data.venueId, parsed.data.hallId ? "manage_halls" : "manage_profile");
  if (!access.ok) return jsonAccess(access);
  const fields: Record<string, { ru?: string; en?: string; ro?: string }> = {};
  for (const [key, value] of Object.entries(parsed.data.fields)) {
    if (!value.trim() || value.length > MAX_LEN) continue;
    fields[key] = { [parsed.data.sourceLanguage]: value.trim() };
  }
  if (!Object.keys(fields).length) return jsonError("No translatable fields", 400);
  try {
    const client = getAiClient();
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2500,
      system: `Translate venue/hall fields for a Moldovan events marketplace. Return JSON object keyed by the given field names, each value {"ro":"...","ru":"...","en":"..."}. Translate only into missing languages. Never invent facts. Source language is ${parsed.data.sourceLanguage}.`,
      messages: [{ role: "user", content: JSON.stringify(parsed.data.fields) }],
    });
    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, Record<string, string>>;
    const result: Record<string, { ro?: string; ru?: string; en?: string }> = {};
    for (const key of Object.keys(parsed.data.fields)) {
      result[key] = {
        [parsed.data.sourceLanguage]: parsed.data.fields[key],
        ...json[key],
      };
    }
    return NextResponse.json({ translations: result, reviewRequired: true });
  } catch {
    return jsonError("TRANSLATION_UNAVAILABLE", 503, { code: "TRANSLATION_UNAVAILABLE" });
  }
}
