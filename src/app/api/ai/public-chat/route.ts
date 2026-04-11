// M9 Intern #3 — Public AI Chatbot (Feature 18).
// A stateless conversational endpoint for visitors: answers FAQ, nudges them
// toward relevant categories/calculators, and can deep-link into the platform.
// Tool-free (unlike the admin/vendor chat) — the public surface is read-only
// and RAG-lite: we inject live counts of artists/venues in the system prompt.

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { artists, venues, categories } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
export const runtime = "nodejs";
import { rateLimit } from "@/lib/rate-limit";

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

// Cache platform stats for 5 minutes so we don't hit the DB on every question.
type Stats = {
  artistCount: number;
  venueCount: number;
  categories: { slug: string; nameRo: string }[];
};
let statsCache: { at: number; data: Stats } | null = null;

async function getStats(): Promise<Stats> {
  if (statsCache && Date.now() - statsCache.at < 5 * 60 * 1000) {
    return statsCache.data;
  }

  const [[artistRow], [venueRow], catRows] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(artists)
      .where(eq(artists.isActive, true)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(venues)
      .where(eq(venues.isActive, true)),
    db
      .select({ slug: categories.slug, nameRo: categories.nameRo })
      .from(categories)
      .where(eq(categories.isActive, true))
      .limit(30),
  ]);

  const data: Stats = {
    artistCount: artistRow?.c ?? 0,
    venueCount: venueRow?.c ?? 0,
    categories: catRows.map((r) => ({ slug: r.slug, nameRo: r.nameRo })),
  };
  statsCache = { at: Date.now(), data };
  return data;
}

function buildSystemPrompt(stats: Stats): string {
  const catList = stats.categories.map((c) => `/categorie/${c.slug} (${c.nameRo})`).join(", ");
  return `Ești asistentul virtual al ePetrecere.md — un marketplace pentru servicii de evenimente din Republica Moldova (nunți, cumetrii, corporate, aniversări).

Date live:
- ${stats.artistCount} artiști activi, ${stats.venueCount} săli de evenimente
- Categorii disponibile: ${catList}

Ce poți face:
- Recomandă utilizatorilor unde să caute (trimite link scurt gen /artisti, /sali, /categorie/SLUG, /calculatoare, /chestionar)
- Explică cum funcționează platforma (gratis pentru clienți, artiștii se listează)
- Ghidează către instrumentele utile: /calculatoare/nunta (calculator buget), /cabinet/buget (tracker), /cabinet/checklist (checklist 12 luni), /chestionar (quiz potrivire furnizori)
- Răspunde la întrebări despre prețuri medii, bune practici, planificare eveniment, tradiții moldovenești

Reguli:
- Răspunde STRICT în limba utilizatorului (română implicit, dar poți trece pe rusă/engleză dacă scrie așa)
- Fii scurt (2-4 propoziții) și prietenos
- Include link-uri interne când ajută (doar path-uri, nu URL-uri complete)
- NU inventa prețuri exacte pentru furnizori specifici — redirecționează la listing
- NU pretinde că ai acces la calendarul sau disponibilitatea cuiva
- Dacă întrebarea e despre suport tehnic / cont / plată → direcționează la /contact

Răspunsuri foarte lungi sunt interzise. Preferă concizia.`;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = rateLimit(`public-chat:${ip}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Prea multe mesaje. Încearcă peste un minut." }, { status: 429 });
  }

  const body = await req.json();
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        reply:
          "Asistentul AI nu este configurat. Pentru ajutor, vizitează /contact sau /chestionar pentru a fi pus în legătură cu furnizori potriviți.",
      },
    );
  }

  try {
    const stats = await getStats();
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: buildSystemPrompt(stats),
      messages: parsed.data.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );

    return NextResponse.json({
      reply:
        textBlock?.text ||
        "Îmi cer scuze, nu am putut genera un răspuns. Încearcă din nou sau vizitează /contact.",
    });
  } catch (err) {
    console.error("[public-chat] error", err);
    return NextResponse.json(
      {
        reply:
          "Am o problemă tehnică momentan. Pentru ajutor imediat, vizitează /contact sau /chestionar.",
      },
    );
  }
}
