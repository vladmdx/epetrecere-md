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
let openAiUnavailableUntil = 0;
let anthropicUnavailableUntil = 0;

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
- Prezintă instrumentele publice: /utilitati (toate), /utilitati/checklist, /utilitati/budget, /utilitati/invitatii-electronice, /utilitati/lista-invitati, /utilitati/momente-eveniment
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

function localReply(message: string, stats: Stats): string {
  const normalized = message.toLocaleLowerCase("ro-RO");
  const isRussian = /[а-яё]/i.test(message);
  const isEnglish =
    !isRussian &&
    /\b(how|what|where|when|wedding|venue|artist|help|cost|budget)\b/i.test(
      message,
    );

  if (
    /tehnic|eroare|autentific|plată|plata|abonament|suport|problem/i.test(
      normalized,
    )
  ) {
    if (isRussian) return "Для технической поддержки напишите нам через /contact. Команда ePetrecere поможет с аккаунтом, оплатой или ошибкой на сайте.";
    if (isEnglish) return "For technical support, contact us through /contact. The ePetrecere team can help with account, payment, or site issues.";
    return "Pentru suport tehnic, scrie-ne prin /contact. Echipa ePetrecere te ajută cu probleme de cont, plată sau funcționarea site-ului.";
  }

  if (/dar de nunt|calculator.*dar|cadou|plic/i.test(normalized)) {
    return "Poți estima rapid suma potrivită cu /calculatoare/dar-nunta. Calculatorul ține cont de relația cu mirii, oraș și tipul locației.";
  }
  if (/buget|cost|costă|pret|preț|nuntă medie|nunta medie/i.test(normalized)) {
    return "Pentru o estimare personalizată folosește /calculatoare/nunta sau /calculatoare/buget. Pentru urmărirea cheltuielilor după ce începi planificarea, deschide /utilitati/budget.";
  }
  if (/momente|galerie|cod qr|fotografiile invitaților|pozele invitaților/i.test(normalized)) {
    return "Cu /utilitati/momente-eveniment creezi o galerie comună și un cod QR prin care invitații încarcă fotografiile direct de pe telefon.";
  }
  if (/invita|mese|rsvp|așez|asez/i.test(normalized)) {
    return "Ai două instrumente potrivite: /utilitati/invitatii-electronice pentru invitații și RSVP, plus /utilitati/lista-invitati pentru lista de invitați și așezarea la mese.";
  }
  if (/băutur|bautur|alcool|vin|șampanie|sampanie/i.test(normalized)) {
    return "Calculatorul /calculatoare/alcool estimează vinul, șampania, băuturile tari și apa în funcție de invitați și durata evenimentului.";
  }
  if (/meniu|mâncare|mancare|porții|portii/i.test(normalized)) {
    return "Folosește /calculatoare/meniu pentru cantități orientative de aperitive, fel principal, desert și gustări în funcție de numărul de invitați.";
  }
  if (/checklist|sarcin|de făcut|de facut/i.test(normalized)) {
    return "Deschide /utilitati/checklist pentru o listă organizată de sarcini, termene și priorități adaptate evenimentului tău.";
  }
  if (/sală|sala|restaurant|locați|locati|capacitate/i.test(normalized)) {
    const count = stats.venueCount ? ` Avem ${stats.venueCount} locații active în catalog.` : "";
    return `Explorează /sali și filtrează după oraș, capacitate și preț.${count} Pentru o selecție personalizată poți porni și din /planifica.`;
  }
  if (/dj|artist|formați|formati|muzic|moderator|fotograf|decor/i.test(normalized)) {
    const count = stats.artistCount ? ` În catalog sunt ${stats.artistCount} furnizori activi.` : "";
    return `Începe din /artisti sau /servicii și folosește filtrele pentru categorie, oraș, preț și rating.${count} Planificatorul /planifica îți poate restrânge selecția.`;
  }
  if (/planific|eveniment|nunt|botez|cumătr|cumatr|anivers/i.test(normalized)) {
    return "Pornește din /planifica: alegi tipul evenimentului, data, numărul de invitați și serviciile dorite, iar platforma îți organizează rezultatele. Toate instrumentele suplimentare sunt în /utilitati.";
  }
  if (/pachet|abonament|epetrecere pro/i.test(normalized)) {
    return "Pachetele și avantajele disponibile sunt prezentate în /pachete. Pentru întrebări despre o plată sau un cont existent, scrie-ne prin /contact.";
  }

  if (isRussian) {
    return "Я могу помочь найти артистов /artisti, площадки /sali и инструменты планирования /utilitati. Для персонального плана начните с /planifica.";
  }
  if (isEnglish) {
    return "I can help you find artists at /artisti, venues at /sali, and planning tools at /utilitati. For a tailored event plan, start at /planifica.";
  }
  return "Te pot ajuta să găsești artiști în /artisti, locații în /sali și toate instrumentele de organizare în /utilitati. Pentru recomandări adaptate evenimentului tău, începe din /planifica.";
}

async function generateWithOpenAI(
  messages: { role: "user" | "assistant"; content: string }[],
  system: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        max_tokens: 500,
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { code?: string; type?: string };
    };
    if (!response.ok) {
      throw new Error(
        `OpenAI ${response.status} ${data.error?.code || data.error?.type || "unknown"}`,
      );
    }
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("OpenAI empty response");
    return reply;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithAnthropic(
  messages: { role: "user" | "assistant"; content: string }[],
  system: string,
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system,
    messages,
  });
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock?.text) throw new Error("Anthropic empty response");
  return textBlock.text;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`public-chat:${ip}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Prea multe mesaje. Încearcă peste un minut." }, { status: 429 });
  }

  const body = await req.json();
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let stats: Stats = { artistCount: 0, venueCount: 0, categories: [] };
  try {
    stats = await getStats();
  } catch (error) {
    console.warn(
      "[public-chat] stats unavailable",
      error instanceof Error ? error.message : "unknown",
    );
  }

  const messages = parsed.data.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const system = buildSystemPrompt(stats);

  if (process.env.OPENAI_API_KEY && Date.now() >= openAiUnavailableUntil) {
    try {
      return NextResponse.json({
        reply: await generateWithOpenAI(messages, system),
      });
    } catch (error) {
      openAiUnavailableUntil = Date.now() + 5 * 60_000;
      console.warn(
        "[public-chat] OpenAI unavailable; using fallback",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }

  if (
    process.env.ANTHROPIC_API_KEY &&
    Date.now() >= anthropicUnavailableUntil
  ) {
    try {
      return NextResponse.json({
        reply: await generateWithAnthropic(messages, system),
      });
    } catch (error) {
      anthropicUnavailableUntil = Date.now() + 5 * 60_000;
      console.warn(
        "[public-chat] Anthropic unavailable; using local assistant",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }

  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ||
    "";
  return NextResponse.json({
    reply: localReply(lastUserMessage, stats),
    mode: "local",
  });
}
