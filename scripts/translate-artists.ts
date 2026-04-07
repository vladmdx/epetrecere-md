import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";

const DATABASE_URL = process.env.DATABASE_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!DATABASE_URL || !ANTHROPIC_API_KEY) {
  console.error("Set DATABASE_URL and ANTHROPIC_API_KEY");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

async function translateBatch(artists: { id: number; name_ru: string; desc_ru: string | null }[]): Promise<{ id: number; nameRo: string; nameEn: string; descRo: string; descEn: string }[]> {
  const input = artists.map((a) => ({
    id: a.id,
    name: a.name_ru,
    desc: (a.desc_ru || "").substring(0, 300),
  }));

  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `Translate these artist names and descriptions from Russian to Romanian (RO) and English (EN).

Rules:
- Names: transliterate Cyrillic names to Latin (e.g. Игорь Недосейкин → Igor Nedoseikin). Keep Latin names as-is.
- Descriptions: translate naturally, keep it professional and concise. If description is empty, write a short 1-sentence description based on the name.
- Return ONLY valid JSON array, no markdown.

Input:
${JSON.stringify(input)}

Return JSON array:
[{"id": 1, "nameRo": "...", "nameEn": "...", "descRo": "...", "descEn": "..."}, ...]`
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "[]";
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.error("Parse error for batch:", e);
  }
  return [];
}

async function main() {
  // Get artists needing translation
  const artists = await sql`SELECT id, name_ru, description_ru as desc_ru FROM artists WHERE name_en IS NULL OR name_en = '' ORDER BY id`;
  console.log(`📝 ${artists.length} artists need translation`);

  const BATCH_SIZE = 10;
  let translated = 0;
  let errors = 0;

  for (let i = 0; i < artists.length; i += BATCH_SIZE) {
    const batch = artists.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(artists.length / BATCH_SIZE)} (artists ${i + 1}-${Math.min(i + BATCH_SIZE, artists.length)})`);

    try {
      const results = await translateBatch(batch as { id: number; name_ru: string; desc_ru: string | null }[]);

      for (const r of results) {
        try {
          await sql`UPDATE artists SET
            name_ro = ${r.nameRo},
            name_en = ${r.nameEn},
            description_ro = ${r.descRo},
            description_en = ${r.descEn},
            seo_title_ro = ${r.nameRo + ' — Artist Evenimente | ePetrecere.md'},
            seo_desc_ro = ${r.descRo.substring(0, 155)}
          WHERE id = ${r.id}`;
          translated++;
        } catch (e) {
          errors++;
          console.error(`  ❌ DB error for ${r.id}:`, String(e).substring(0, 80));
        }
      }

      console.log(`  ✅ ${results.length} translated`);

      // Rate limit: wait 1s between batches
      if (i + BATCH_SIZE < artists.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (e) {
      errors += batch.length;
      console.error(`  ❌ Batch error:`, String(e).substring(0, 100));
      // Wait longer on error
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log(`\n🎉 Translation complete!`);
  console.log(`✅ Translated: ${translated}`);
  console.log(`❌ Errors: ${errors}`);
}

main().catch(console.error);
