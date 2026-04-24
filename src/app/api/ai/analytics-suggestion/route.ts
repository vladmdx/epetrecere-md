// AI suggestions for improving venue performance.
//
// Takes the current period stats + city comparison and asks Claude for 3
// concrete, actionable improvements in Romanian. Rate-limited aggressively
// so a tab refresh doesn't burn tokens.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  venueId: z.number().int().positive(),
  period: z.string().max(10),
  stats: z.object({
    views: z.number(),
    ctaClicks: z.number(),
    conversionRate: z.number(),
    galleryClicks: z.number(),
    menuClicks: z.number(),
    rating: z.number().nullable(),
    price: z.number().nullable(),
    city: z.string().nullable(),
    cityAvgPrice: z.number().nullable(),
    cityAvgRating: z.number().nullable(),
    cityAvgViews: z.number().nullable(),
  }),
});

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3 calls/5min per IP — the suggestion text is deterministic enough that
  // re-hitting only makes sense after data changes meaningfully.
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`analytics-ai:${ip}`, 3, 5 * 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "Prea multe cereri. Încearcă peste 5 min." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Ownership
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [venue] = await db
    .select({ userId: venues.userId, nameRo: venues.nameRo })
    .from(venues)
    .where(eq(venues.id, parsed.data.venueId))
    .limit(1);
  if (!venue || venue.userId !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const s = parsed.data.stats;
  const facts = [
    `Sală: ${venue.nameRo}`,
    s.city ? `Oraș: ${s.city}` : "",
    `Perioadă: ${parsed.data.period}`,
    `Vizite profil: ${s.views}`,
    `Click "Solicită rezervare": ${s.ctaClicks} (rata conversie ${s.conversionRate}%)`,
    `Vizualizări galerie: ${s.galleryClicks}`,
    `Vizualizări meniu: ${s.menuClicks}`,
    s.rating != null ? `Rating: ${s.rating}` : "Nicio recenzie",
    s.price != null ? `Preț/persoană: ${s.price}€` : "Preț nespecificat",
    s.cityAvgPrice != null
      ? `Media oraș preț: ${Math.round(s.cityAvgPrice)}€`
      : "",
    s.cityAvgRating != null
      ? `Media oraș rating: ${s.cityAvgRating.toFixed(1)}`
      : "",
    s.cityAvgViews != null ? `Media oraș vizite: ${s.cityAvgViews}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `Ești consultant digital pentru săli de evenimente din Moldova. Analizezi statistici Web Analytics și oferi sfaturi practice pentru creșterea cererilor de rezervare.

Stil:
- Răspunde DOAR în română
- 3 sugestii numerotate, fiecare ≤ 2 propoziții
- Concret și măsurabil (prag, procent, acțiune clară) — NU generalități
- Nu repeta statisticile — owner-ul le vede deja
- Începe direct cu sugestiile (fără introducere)

Dacă rata de conversie e < 2%, prioritizează fixarea profilului (poze, preț, descriere).
Dacă conversia e bună dar vizitele puține, prioritizează SEO / promovare.
Dacă prețul e mult peste medie fără rating superior, menționează asta.`;

  try {
    const message = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analizează:\n\n${facts}\n\nPropune 3 sugestii.`,
        },
      ],
    });
    const block = message.content[0];
    const text = block?.type === "text" ? block.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "AI a returnat gol" }, { status: 502 });
    }
    return NextResponse.json({ suggestion: text });
  } catch (err) {
    console.error("[analytics-suggestion] error", err);
    return NextResponse.json(
      { error: "Serviciul AI nu e disponibil" },
      { status: 503 },
    );
  }
}
