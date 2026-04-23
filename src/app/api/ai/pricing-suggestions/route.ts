// AI pricing suggestions — Claude analyzes the caller's current packages
// against platform medians in the same category/city and suggests:
//   - Base price adjustments (too cheap? too high for the market?)
//   - Seasonal multipliers (weekend, summer, December, New Year's)
//   - Event-type premiums (weddings vs. corporate)
//
// Response is a list of suggestions with reasoning; the UI presents them
// as cards the vendor can apply with one click (future work — for now
// the vendor reads the advice and edits manually).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, artists, venues } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

const MODEL = "claude-sonnet-4-5";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  return new Anthropic({ apiKey });
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`pricing-ai:${ip}`, 10, 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "Prea multe cereri. Încearcă în câteva secunde." },
      { status: 429 },
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

  // Resolve artist or venue owned by this user
  const [artist] = await db
    .select({
      id: artists.id,
      nameRo: artists.nameRo,
      priceFrom: artists.priceFrom,
      location: artists.location,
    })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  const [venue] = await db
    .select({
      id: venues.id,
      nameRo: venues.nameRo,
      pricePerPerson: venues.pricePerPerson,
      capacityMax: venues.capacityMax,
      city: venues.city,
    })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);

  if (!artist && !venue) {
    return NextResponse.json(
      { error: "Nu ai un profil de artist sau sală" },
      { status: 404 },
    );
  }

  // Fetch anonymized market data for context
  let marketSummary = "Date market indisponibile.";
  try {
    if (artist) {
      const stats = await db.execute<{
        avg: string;
        median: string;
        count: string;
      }>(sql`
        SELECT
          ROUND(AVG(price_from)::numeric, 0) AS avg,
          ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_from)::numeric, 0) AS median,
          COUNT(*) AS count
        FROM artists
        WHERE price_from IS NOT NULL
          AND is_active = true
          ${artist.location ? sql`AND location = ${artist.location}` : sql``}
      `);
      const row = stats.rows?.[0];
      if (row) {
        marketSummary =
          `Artiști activi ${artist.location ? `în ${artist.location}` : "pe platformă"}: ` +
          `median ${row.median}€, media ${row.avg}€, din ${row.count} profile.`;
      }
    } else if (venue) {
      const stats = await db.execute<{
        avg: string;
        median: string;
        count: string;
      }>(sql`
        SELECT
          ROUND(AVG(price_per_person)::numeric, 0) AS avg,
          ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_person)::numeric, 0) AS median,
          COUNT(*) AS count
        FROM venues
        WHERE price_per_person IS NOT NULL
          AND is_active = true
          ${venue.city ? sql`AND city = ${venue.city}` : sql``}
      `);
      const row = stats.rows?.[0];
      if (row) {
        marketSummary =
          `Săli active ${venue.city ? `în ${venue.city}` : "pe platformă"}: ` +
          `median ${row.median}€/pers, media ${row.avg}€/pers, din ${row.count} profile.`;
      }
    }
  } catch (err) {
    console.error("[pricing-ai] market stats failed", err);
  }

  const entityContext = artist
    ? `Profil: ARTIST "${artist.nameRo}".
Preț actual: ${artist.priceFrom ? `${artist.priceFrom}€ de la` : "nesetat"}.
Locație: ${artist.location || "nespecificată"}.`
    : `Profil: SALĂ "${venue!.nameRo}".
Preț/persoană actual: ${venue!.pricePerPerson ? `${venue!.pricePerPerson}€` : "nesetat"}.
Capacitate max: ${venue!.capacityMax || "?"}.
Oraș: ${venue!.city || "nespecificat"}.`;

  const SYSTEM_PROMPT = `Ești un consultant de pricing pentru platforma ePetrecere.md (marketplace de servicii pentru evenimente din Republica Moldova).
Furnizorul îți cere sfaturi despre prețuri pe baza datelor lui + medianei pieței.

Răspunzi DOAR cu JSON valid, fără markdown fence, fără explicații laterale. Structură:
{
  "suggestions": [
    {
      "title": "scurt, ≤60 chars, în română",
      "reason": "1-2 propoziții, de ce acum + date concrete",
      "action": "instrucțiune concretă în română (ex: 'Crește prețul de bază cu 15%')",
      "priority": "high" | "medium" | "low"
    }
    // 3-5 sugestii
  ],
  "seasonalMultipliers": {
    "weekend": number,      // ex: 1.25 pentru +25%
    "summer": number,        // iunie-august
    "december": number,      // decembrie
    "newYear": number        // 25 dec - 5 ian
  },
  "verdictScurt": "o propoziție despre poziționarea actuală: 'subestimat', 'la piață', 'overpriced'"
}

Reguli:
- Folosește datele de market pentru comparație reală. Nu inventa cifre.
- Sugestiile trebuie să fie ACTIONABLE (crește cu X%, adaugă premium pentru Y).
- Ton: profesional, direct, fără "poate", "s-ar putea". Furnizorul caută claritate.
- Prioritizează sezoniere (weekend=1.2-1.3, nuntă July=1.3-1.5 e normal în MD).
- Dacă datele sunt incomplete, spune-o în verdictScurt și fă sugestii generale pentru MD.`;

  let out;
  try {
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${entityContext}\n\nContext piață: ${marketSummary}\n\nAnalizează și propune strategie de preț.`,
        },
      ],
    });
    const block = msg.content[0];
    const text = block.type === "text" ? block.text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    out = JSON.parse(match[0]);
  } catch (err) {
    console.error("[pricing-ai] claude failed", err);
    return NextResponse.json(
      { error: "AI indisponibil. Încearcă peste câteva minute." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    marketSummary,
    ...out,
  });
}
