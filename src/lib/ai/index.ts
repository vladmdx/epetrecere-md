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
