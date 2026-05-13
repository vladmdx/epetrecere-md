import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

export async function generateArtistDescription(
  name: string,
  category: string,
  originalDescription: string,
  language: "ro" | "ru" | "en" = "ro",
): Promise<string> {
  const langNames = { ro: "Romanian", ru: "Russian", en: "English" };

  const message = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Rewrite the following artist description to be unique, SEO-optimized, and professional. Keep the same facts but completely rephrase in ${langNames[language]}. Keep it concise (2-3 paragraphs).

Artist: ${name}
Category: ${category}
Original: ${originalDescription}`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}

export async function generateArtistDescriptionFromScratch(
  name: string,
  category: string,
  location: string,
  language: "ro" | "ru" | "en" = "ro",
): Promise<string> {
  const langNames = { ro: "Romanian", ru: "Russian", en: "English" };

  const message = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `Write a professional, engaging description for an event artist/service profile on an events marketplace. Write in ${langNames[language]}. The description should be 2-3 paragraphs, SEO-friendly, and highlight the artist's strengths and appeal to potential clients looking for event entertainment.

Artist name: ${name}
Category: ${category}
Location: ${location}

Write ONLY the description text, no titles or headings.`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}

/**
 * Generate (or rewrite) a rich-text venue description. Returns HTML so it
 * plugs straight into the TipTap editor. `mode: "improve"` rewrites the
 * supplied text; `mode: "generate"` writes from scratch using venue facts.
 */
export async function generateVenueDescription(
  args: {
    name: string;
    city: string | null;
    capacityMin: number | null;
    capacityMax: number | null;
    facilities: string[];
    current?: string;
    mode: "improve" | "generate";
    language: "ro" | "ru" | "en";
  },
): Promise<string> {
  const langNames = { ro: "Romanian", ru: "Russian", en: "English" };
  const facts = [
    `Name: ${args.name}`,
    args.city ? `City: ${args.city}` : "",
    args.capacityMin || args.capacityMax
      ? `Capacity: ${args.capacityMin ?? "?"}–${args.capacityMax ?? "?"} guests`
      : "",
    args.facilities.length > 0
      ? `Facilities: ${args.facilities.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt =
    args.mode === "improve"
      ? "You rewrite venue descriptions to be more engaging, SEO-optimized, and persuasive while preserving all factual content."
      : "You write professional, warm venue descriptions from structured facts for an events marketplace.";

  const userPrompt =
    args.mode === "improve" && args.current?.trim()
      ? `Rewrite this venue description in ${langNames[args.language]}. Keep the same facts, improve the flow, and aim for roughly 250-350 words across 3-4 short HTML paragraphs. Use <p>, <strong>, <ul>/<li> where helpful. Do NOT invent amenities — only use what the facts support.

Facts:
${facts}

Original:
${args.current}

Return ONLY the HTML body (no <html>, <body>, or code fences).`
      : `Write an engaging venue description in ${langNames[args.language]}. Target 250-350 words across 3-4 short HTML paragraphs with <p>, <strong>, and optionally <ul>/<li>. Mention the listed facilities naturally. Do NOT invent amenities.

Facts:
${facts}

Return ONLY the HTML body (no <html>, <body>, or code fences).`;

  const message = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content[0];
  const text = block.type === "text" ? block.text : "";
  // Strip accidental code fences if the model added them despite instructions.
  return text.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

/**
 * Batch-translate a list of Romanian menu strings to Russian AND English in
 * a single Claude call. Returns arrays in the same order as the input.
 * Sends up to ~300 strings per call — larger payloads should be chunked by
 * the caller.
 *
 * We ask for JSON back so we can parse without regex. If parsing fails we
 * fall back to returning the originals unchanged (the caller decides whether
 * to overwrite).
 */
export async function translateMenuStrings(
  texts: string[],
): Promise<{ ru: string[]; en: string[] }> {
  if (texts.length === 0) return { ru: [], en: [] };

  const numbered = texts
    .map((t, i) => `${i + 1}. ${t.replace(/\s+/g, " ").trim()}`)
    .join("\n");

  const message = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: `You translate Moldovan restaurant menu strings. Output strict JSON: {"ru": ["...", ...], "en": ["...", ...]}.
- Keep the same order as input.
- Keep culinary terms natural (e.g., "Salată Cezar" → "Цезарь" / "Caesar Salad", not literal).
- Preserve capitalization style of the original.
- Do not add extra commentary or markdown fences.`,
    messages: [
      {
        role: "user",
        content: `Translate these ${texts.length} menu strings from Romanian to Russian and English:\n\n${numbered}\n\nReturn ONLY: {"ru": [array of ${texts.length} Russian translations], "en": [array of ${texts.length} English translations]}`,
      },
    ],
  });

  const block = message.content[0];
  const raw = block?.type === "text" ? block.text : "";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as { ru?: string[]; en?: string[] };
    if (Array.isArray(parsed.ru) && Array.isArray(parsed.en)) {
      return {
        ru: parsed.ru.map((s, i) => s ?? texts[i]),
        en: parsed.en.map((s, i) => s ?? texts[i]),
      };
    }
  } catch {
    // fall through
  }
  // Recovery: try to extract the first {...} block
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]) as { ru?: string[]; en?: string[] };
      if (Array.isArray(parsed.ru) && Array.isArray(parsed.en)) {
        return {
          ru: parsed.ru.map((s, i) => s ?? texts[i]),
          en: parsed.en.map((s, i) => s ?? texts[i]),
        };
      }
    } catch {
      /* noop */
    }
  }
  // Total failure — return originals so the caller can decide not to write.
  return { ru: texts, en: texts };
}

export async function generateSEOTexts(
  entityName: string,
  entityType: "artist" | "venue",
  description: string,
  language: "ro" | "ru" | "en" = "ro",
): Promise<{ title: string; metaDescription: string }> {
  const message = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Generate SEO meta title (max 60 chars) and meta description (max 155 chars) in ${language === "ro" ? "Romanian" : language === "ru" ? "Russian" : "English"} for this ${entityType}:

Name: ${entityName}
Description: ${description}

Return ONLY JSON: {"title": "...", "metaDescription": "..."}`,
      },
    ],
  });

  const block = message.content[0];
  const text = block.type === "text" ? block.text : "{}";

  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fallback */ }

  return {
    title: `${entityName} — ${entityType === "artist" ? "Artist" : "Sală"} Evenimente | ePetrecere.md`,
    metaDescription: description.substring(0, 155),
  };
}

/** Phase 5/E3 — short caption for a Photo Moments entry. Uses the
 *  context the photo already carries (prompt label, guest name,
 *  guest message, event title) and produces a 1-line RO caption like
 *  "Primul dans — un moment magic surprins de Ana". Cheap to run:
 *  Haiku, ~100 tokens out. */
export async function generatePhotoCaption(args: {
  eventTitle: string;
  prompt?: string | null;
  guestName?: string | null;
  guestMessage?: string | null;
}): Promise<string> {
  const facts = [
    `Eveniment: ${args.eventTitle}`,
    args.prompt ? `Misiunea pozei: ${args.prompt}` : null,
    args.guestName ? `Trimis de: ${args.guestName}` : null,
    args.guestMessage ? `Mesaj invitat: ${args.guestMessage}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const message = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 120,
    system:
      "Ești copywriter pentru un album foto de eveniment. Scrii un singur caption în română, sub 110 caractere, cald, concret, fără emoji. Nu inventa detalii care nu apar în date. Răspunzi DOAR cu caption-ul, fără ghilimele.",
    messages: [
      {
        role: "user",
        content: `Generează un caption pentru această poză de eveniment.\n\n${facts}`,
      },
    ],
  });
  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";
  return text.replace(/^["']|["']$/g, "").trim().slice(0, 200);
}

export async function chatWithAI(
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
): Promise<string> {
  const response = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}
