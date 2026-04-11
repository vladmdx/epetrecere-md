// M9 Intern #2 — Lead Quality Score AI.
// Calls Claude to score an incoming lead 0-100 with short rationale bullets.
// Designed for fire-and-forget use from /api/leads POST: errors are swallowed
// and the row is updated after the AI response arrives.

import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";

export interface LeadPayload {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  location?: string | null;
  guestCount?: number | null;
  budget?: number | null;
  message?: string | null;
  source?: string | null;
  services?: string[];
}

export interface QualityScoreResult {
  score: number;
  reasons: string[];
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/** Deterministic fallback used when the AI is unavailable. Mirrors the
 *  heuristic we already had but returns reasons too, so the CRM always shows
 *  something meaningful. */
export function fallbackScore(lead: LeadPayload): QualityScoreResult {
  let score = 10;
  const reasons: string[] = [];

  if (lead.budget) {
    if (lead.budget > 5000) {
      score += 30;
      reasons.push(`Buget mare (${lead.budget}€)`);
    } else if (lead.budget > 2000) {
      score += 20;
      reasons.push(`Buget decent (${lead.budget}€)`);
    } else if (lead.budget > 500) {
      score += 10;
      reasons.push(`Buget modest (${lead.budget}€)`);
    }
  } else {
    reasons.push("Fără buget declarat");
  }

  if (lead.eventType === "wedding") {
    score += 20;
    reasons.push("Nuntă (categoria cu valoare mare)");
  }
  if (lead.source === "wizard") {
    score += 15;
    reasons.push("Chestionar complet (intenție clară)");
  }
  if (lead.eventDate) {
    score += 5;
    reasons.push("Dată fixă stabilită");
  }
  if (lead.email) {
    score += 5;
    reasons.push("Email prezent");
  }
  if (lead.message && lead.message.length > 40) {
    score += 5;
    reasons.push("Mesaj detaliat");
  }

  return { score: Math.min(score, 100), reasons };
}

/** Try the Anthropic API; on any error return the deterministic fallback. */
export async function scoreLeadWithAI(
  lead: LeadPayload,
): Promise<QualityScoreResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackScore(lead);
  }

  const prompt = `Ești un analist CRM pentru o platformă de evenimente din Moldova (ePetrecere.md). Evaluează următorul lead pe o scară 0-100 (cât de probabil este să se transforme într-o rezervare plătită).

Criterii:
- Buget concret și realist (nuntă medie MD ≈ 10.000€, eveniment corporate ≈ 3.000€)
- Dată fixă vs. "oricând"
- Tip de eveniment (nuntă/cumetrie = valoare mare)
- Detaliile date (invitați, locație, mesaj elaborat)
- Sursa (wizard > form > direct)
- Prezența email-ului (follow-up posibil)

Lead:
- Nume: ${lead.name}
- Telefon: ${lead.phone ?? "—"}
- Email: ${lead.email ?? "—"}
- Tip eveniment: ${lead.eventType ?? "—"}
- Data: ${lead.eventDate ?? "—"}
- Locație: ${lead.location ?? "—"}
- Invitați: ${lead.guestCount ?? "—"}
- Buget: ${lead.budget ? `${lead.budget}€` : "—"}
- Servicii cerute: ${lead.services?.length ? lead.services.join(", ") : "—"}
- Sursă: ${lead.source ?? "—"}
- Mesaj: ${lead.message ?? "—"}

Răspunde STRICT cu JSON valid pe o singură linie:
{"score": <număr 0-100>, "reasons": ["motiv scurt 1", "motiv scurt 2", "motiv scurt 3"]}

Maxim 4 motive, fiecare sub 60 de caractere, în română.`;

  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    const text = block.type === "text" ? block.text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallbackScore(lead);

    const parsed = JSON.parse(match[0]) as {
      score?: number;
      reasons?: string[];
    };

    const score = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed.score) || 0)),
    );
    const reasons = Array.isArray(parsed.reasons)
      ? parsed.reasons.filter((r) => typeof r === "string").slice(0, 4)
      : [];

    if (!reasons.length) return fallbackScore(lead);
    return { score, reasons };
  } catch (e) {
    console.error("[quality-score] AI scoring failed", e);
    return fallbackScore(lead);
  }
}

/** Fire-and-forget wrapper: scores a lead and updates the row. Never throws. */
export async function scoreAndPersist(lead: LeadPayload): Promise<void> {
  try {
    const result = await scoreLeadWithAI(lead);
    await db
      .update(leads)
      .set({ aiScore: result.score, aiReasons: result.reasons })
      .where(eq(leads.id, lead.id));
  } catch (e) {
    console.error("[quality-score] persist failed", e);
  }
}
