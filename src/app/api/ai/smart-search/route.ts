// Semantic search — user types a free-text query and Claude translates it
// into structured filter parameters we already understand (category, price,
// date, guest count, event type).
//
// Example queries this handles:
//   "artist pentru cumătrie sub 500€ cu muzică populară"
//   "sală nuntă 150 invitați chișinău"
//   "dj disponibil pe 20 iulie"
//
// Response shape:
//   {
//     entity: "artist" | "venue",
//     filters: { category?, priceMin?, priceMax?, eventType?, date?, city?, guests? },
//     explanation: "short plain-text summary of what we understood",
//     url: "/artisti?category=..." | "/sali?..."
//   }
//
// If the query is ambiguous (e.g. "muzică frumoasă"), we return the filters
// we could extract plus a clarification suggestion. The client can decide
// whether to auto-navigate or show hints.
//
// Rate-limited per IP to prevent Anthropic API abuse.

import { NextRequest, NextResponse } from "next/server";
import { MODELS } from "@/lib/ai/models";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  q: z.string().min(3).max(200),
});

const ALLOWED_CATEGORIES = [
  "moderatori",
  "dj",
  "cantareti-de-estrada",
  "interpreti-muzica-populara",
  "cover-band",
  "formatii",
  "instrumentalisti",
  "cvartet",
  "dansatori",
  "dansuri-populare",
  "ansamblu-tiganesc",
  "show-program",
  "animatori",
  "stand-up",
  "echipament-tehnic",
  "foto-video",
  "foto-zona-selfie",
];

const ALLOWED_EVENT_TYPES = [
  "wedding",
  "baptism",
  "cumatrie",
  "corporate",
  "birthday",
  "other",
];

const ALLOWED_CITIES = [
  "chisinau",
  "balti",
  "cahul",
  "orhei",
  "ungheni",
  "soroca",
  "tiraspol",
  "comrat",
];

const SYSTEM_PROMPT = `You are a query parser for ePetrecere.md, a Moldovan event services marketplace. Given a free-text user query in Romanian/Russian/English, you MUST extract structured filter parameters.

Output ONLY valid JSON, no prose, no markdown fence. Shape:
{
  "entity": "artist" | "venue",
  "categorySlug": string | null,  // one of: ${ALLOWED_CATEGORIES.join(", ")}
  "eventType": string | null,     // one of: ${ALLOWED_EVENT_TYPES.join(", ")}
  "priceMin": number | null,      // EUR
  "priceMax": number | null,
  "city": string | null,          // normalized slug, one of: ${ALLOWED_CITIES.join(", ")}
  "guests": number | null,        // guest count (mostly for venues)
  "date": string | null,          // ISO YYYY-MM-DD, or null if none specified
  "explanation": string           // <= 100 char plain-Romanian summary of what you understood
}

Rules:
- If query mentions "sală", "restaurant", "loc", "local" → entity = "venue"; otherwise entity = "artist"
- "nuntă/nunta/wedding" → eventType="wedding"; "cumătrie/cumatrie" → "cumatrie"; "botez" → "baptism"; "corporate" → "corporate"; "zi de naștere/aniversare/birthday" → "birthday"; else "other" or null
- Price words: "ieftin/cheap" → priceMax=300; "sub 500€" → priceMax=500; "premium" → priceMin=1000; otherwise null
- Resolve common Romanian city typos: "kishinev/chisinau/chișinău" → "chisinau"; "balti/bălți/beltsy" → "balti"
- Category mapping: "DJ" → "dj", "moderator" → "moderatori", "formație live/band" → "cover-band" or "formatii", "muzică populară" → "interpreti-muzica-populara", "fotograf/video" → "foto-video", "animator copii" → "animatori"
- Never hallucinate categories or cities outside the allowed lists. Return null if uncertain.
- explanation must be in Romanian and factual — describe only the filters you set.`;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  return new Anthropic({ apiKey });
}

function buildUrl(parsed: ParsedQuery): string {
  const params = new URLSearchParams();
  if (parsed.categorySlug && parsed.entity === "artist") {
    // category filter is handled by the listing page via ?category slug
    params.set("category", parsed.categorySlug);
  }
  if (parsed.priceMin) params.set("price_min", String(parsed.priceMin));
  if (parsed.priceMax) params.set("price_max", String(parsed.priceMax));
  if (parsed.city) params.set("city", parsed.city);
  if (parsed.date) params.set("date", parsed.date);
  if (parsed.guests && parsed.entity === "venue")
    params.set("guests", String(parsed.guests));
  const base = parsed.entity === "venue" ? "/sali" : "/artisti";
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

interface ParsedQuery {
  entity: "artist" | "venue";
  categorySlug: string | null;
  eventType: string | null;
  priceMin: number | null;
  priceMax: number | null;
  city: string | null;
  guests: number | null;
  date: string | null;
  explanation: string;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`smart-search:${ip}`, 30, 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "Prea multe căutări. Încearcă în câteva secunde." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Query invalid" },
      { status: 400 },
    );
  }

  let out: ParsedQuery;
  try {
    const msg = await getClient().messages.create({
      model: MODELS.CHAT,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: parsed.data.q }],
    });
    const block = msg.content[0];
    const text = block.type === "text" ? block.text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    out = JSON.parse(match[0]);
  } catch (err) {
    console.error("[smart-search] claude parse failed", err);
    // Safe fallback — return listing with no filters + hint to refine
    return NextResponse.json({
      entity: "artist",
      filters: {},
      url: "/artisti",
      explanation:
        "Nu am putut interpreta cererea. Folosește filtrele din pagină pentru a căuta mai precis.",
    });
  }

  // Validation: reject values outside allowed lists (prevents prompt injection
  // abuse + bogus query strings). Null them out if present.
  if (out.categorySlug && !ALLOWED_CATEGORIES.includes(out.categorySlug))
    out.categorySlug = null;
  if (out.eventType && !ALLOWED_EVENT_TYPES.includes(out.eventType))
    out.eventType = null;
  if (out.city && !ALLOWED_CITIES.includes(out.city)) out.city = null;
  if (out.entity !== "artist" && out.entity !== "venue") out.entity = "artist";

  return NextResponse.json({
    entity: out.entity,
    filters: {
      categorySlug: out.categorySlug,
      eventType: out.eventType,
      priceMin: out.priceMin,
      priceMax: out.priceMax,
      city: out.city,
      guests: out.guests,
      date: out.date,
    },
    url: buildUrl(out),
    explanation: out.explanation,
  });
}
