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
import { eq } from "drizzle-orm";
import {
  authorizeVenueCapability,
  getCurrentAppUser,
  resolveSelectedVenue,
} from "@/lib/venue-access";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, venues } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { getAiClient } from "@/lib/ai/provider";

const MODEL = "claude-sonnet-4-5";

function getClient() {
  return getAiClient();
}

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
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

  const body = (await req.json().catch(() => ({}))) as { venueId?: unknown };
  const requestedVenueId =
    body.venueId == null || body.venueId === "" ? null : Number(body.venueId);
  if (requestedVenueId != null && !Number.isSafeInteger(requestedVenueId)) {
    return NextResponse.json({ error: "Invalid venue id" }, { status: 400 });
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

  let venue:
    | {
        id: number;
        nameRo: string;
        pricePerPerson: number | null;
        capacityMax: number | null;
        city: string | null;
      }
    | undefined;
  // An explicit venue selection always wins. For backward compatibility, an
  // artist-only request continues to analyze the artist; a venue-only account
  // with exactly one venue is selected automatically. Multi-venue accounts
  // must send venueId instead of silently analyzing an arbitrary first row.
  if (requestedVenueId != null || !artist) {
    const selection = await resolveSelectedVenue(appUser.id, requestedVenueId);
    if (!selection.ok) {
      if (selection.reason === "none") {
        return NextResponse.json(
          { error: "Nu ai un profil de artist sau local", code: "VENUE_REQUIRED" },
          { status: 404 },
        );
      }
      if (selection.reason === "ambiguous") {
        return NextResponse.json(
          {
            error: "Alege localul pentru care dorești analiza.",
            code: "VENUE_REQUIRED",
            venueIds: selection.venueIds,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const access = await authorizeVenueCapability(
      appUser,
      selection.venueId,
      "manage_ai",
    );
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    [venue] = await db
      .select({
        id: venues.id,
        nameRo: venues.nameRo,
        pricePerPerson: venues.pricePerPerson,
        capacityMax: venues.capacityMax,
        city: venues.city,
      })
      .from(venues)
      .where(eq(venues.id, selection.venueId))
      .limit(1);
  }

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
