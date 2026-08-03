import { neon } from "@neondatabase/serverless";

type SourceFields = Record<string, string | null>;
type Translation = { ru: Record<string, string>; en: Record<string, string> };

const apply = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL || "");

const CATEGORY_NAME_REPAIRS: Record<number, { ru: string; en?: string }> = {
  11: { ru: "Эстрадные певцы" },
  12: { ru: "Исполнители народной музыки" },
  13: { ru: "Кавер-группа" },
  14: { ru: "Инструменталисты" },
  15: { ru: "Квартет" },
  16: { ru: "Танцоры" },
  17: { ru: "Народные танцы" },
  18: { ru: "Ромский ансамбль" },
  19: { ru: "Восточный танец" },
  20: { ru: "Стриптиз-шоу", en: "Striptease Show" },
  21: { ru: "Иллюзионисты / Фокусники" },
  22: { ru: "Огненное шоу" },
  23: { ru: "Клоуны" },
  24: { ru: "Развлечения на праздник", en: "Party Entertainment" },
  25: { ru: "Стендап" },
  26: { ru: "Цирковое шоу", en: "Circus Show" },
  27: { ru: "Дед Мороз" },
  28: { ru: "Фото и видео" },
  29: { ru: "Фотозона / Селфи-зона", en: "Photo Booth / Selfie Zone" },
};

function missing(value: string | null | undefined): boolean {
  return !value?.trim();
}

async function translate(fields: SourceFields, context: string): Promise<Translation> {
  const source = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value?.trim()),
  );
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.I18N_MODEL || "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
      messages: [
        {
          role: "system",
          content: `Translate public ePetrecere.md content from Romanian to natural Russian and English for users in Moldova. Context: ${context}.
Return strict JSON {"ru":{...},"en":{...}} with exactly the same field keys as the input object.
Preserve HTML tags, Markdown, URLs, prices, names, brands, emoji and formatting. Translate headings, descriptions and SEO text. Do not add facts or marketing claims. Do not use the long em dash character.`,
        },
        { role: "user", content: JSON.stringify(source) },
      ],
    }),
  });
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI ${response.status}`);
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}") as Translation;
  for (const key of Object.keys(source)) {
    if (!parsed.ru?.[key] || !parsed.en?.[key]) {
      throw new Error(`Missing translated field ${key} for ${context}`);
    }
  }
  return parsed;
}

async function mapLimit<T>(
  rows: T[],
  worker: (row: T) => Promise<void>,
  concurrency = 3,
) {
  let cursor = 0;
  async function run() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      await worker(row);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, run));
}

async function categories() {
  const rows = await sql`select id, name_ro, name_ru, name_en, description_ro,
    description_ru, description_en, seo_title_ro, seo_title_ru, seo_title_en,
    seo_desc_ro, seo_desc_ru, seo_desc_en from categories`;
  const pending = rows.filter((row) =>
    missing(row.name_ru as string | null) || missing(row.name_en as string | null) ||
    (row.description_ro && (missing(row.description_ru as string | null) || missing(row.description_en as string | null))) ||
    (row.seo_title_ro && (missing(row.seo_title_ru as string | null) || missing(row.seo_title_en as string | null))) ||
    (row.seo_desc_ro && (missing(row.seo_desc_ru as string | null) || missing(row.seo_desc_en as string | null))),
  );
  if (!apply) return pending.length;
  await mapLimit(pending, async (row) => {
    const tr = await translate({
      name: row.name_ro as string,
      description: row.description_ro as string | null,
      seoTitle: row.seo_title_ro as string | null,
      seoDescription: row.seo_desc_ro as string | null,
    }, "event service category");
    await sql`update categories set
      name_ru = case when nullif(name_ru, '') is null then ${tr.ru.name} else name_ru end,
      name_en = case when nullif(name_en, '') is null then ${tr.en.name} else name_en end,
      description_ru = case when nullif(description_ru, '') is null then ${tr.ru.description ?? null} else description_ru end,
      description_en = case when nullif(description_en, '') is null then ${tr.en.description ?? null} else description_en end,
      seo_title_ru = case when nullif(seo_title_ru, '') is null then ${tr.ru.seoTitle ?? null} else seo_title_ru end,
      seo_title_en = case when nullif(seo_title_en, '') is null then ${tr.en.seoTitle ?? null} else seo_title_en end,
      seo_desc_ru = case when nullif(seo_desc_ru, '') is null then ${tr.ru.seoDescription ?? null} else seo_desc_ru end,
      seo_desc_en = case when nullif(seo_desc_en, '') is null then ${tr.en.seoDescription ?? null} else seo_desc_en end
      where id = ${row.id}`;
  });
  return pending.length;
}

async function categoryNameRepairs() {
  const rows = await sql`select id, name_ru, name_en from categories
    where id = any(${Object.keys(CATEGORY_NAME_REPAIRS).map(Number)}::int[])`;
  const pending = rows.filter((row) => {
    const repair = CATEGORY_NAME_REPAIRS[row.id as number];
    return row.name_ru !== repair.ru || (repair.en && row.name_en !== repair.en);
  });
  if (!apply) return pending.length;
  for (const row of pending) {
    const repair = CATEGORY_NAME_REPAIRS[row.id as number];
    await sql`update categories set name_ru = ${repair.ru},
      name_en = ${repair.en ?? (row.name_en as string | null)} where id = ${row.id}`;
  }
  return pending.length;
}

async function profiles(table: "artists" | "venues") {
  const rows = table === "artists"
    ? await sql`select id, name_ro, name_ru, name_en, description_ro, description_ru,
        description_en, seo_title_ro, seo_title_ru, seo_title_en, seo_desc_ro,
        seo_desc_ru, seo_desc_en from artists`
    : await sql`select id, name_ro, name_ru, name_en, description_ro, description_ru,
        description_en, seo_title_ro, seo_title_ru, seo_title_en, seo_desc_ro,
        seo_desc_ru, seo_desc_en from venues`;
  const pending = rows.filter((row) =>
    missing(row.name_ru as string | null) || missing(row.name_en as string | null) ||
    (row.description_ro && (missing(row.description_ru as string | null) || missing(row.description_en as string | null))) ||
    (row.seo_title_ro && (missing(row.seo_title_ru as string | null) || missing(row.seo_title_en as string | null))) ||
    (row.seo_desc_ro && (missing(row.seo_desc_ru as string | null) || missing(row.seo_desc_en as string | null))),
  );
  if (!apply) return pending.length;
  await mapLimit(pending, async (row) => {
    const tr = await translate({
      name: row.name_ro as string,
      description: row.description_ro as string | null,
      seoTitle: row.seo_title_ro as string | null,
      seoDescription: row.seo_desc_ro as string | null,
    }, table === "artists" ? "artist profile" : "event venue profile");
    if (table === "artists") {
      await sql`update artists set
        name_ru = case when nullif(name_ru, '') is null then ${tr.ru.name} else name_ru end,
        name_en = case when nullif(name_en, '') is null then ${tr.en.name} else name_en end,
        description_ru = case when nullif(description_ru, '') is null then ${tr.ru.description ?? null} else description_ru end,
        description_en = case when nullif(description_en, '') is null then ${tr.en.description ?? null} else description_en end,
        seo_title_ru = case when nullif(seo_title_ru, '') is null then ${tr.ru.seoTitle ?? null} else seo_title_ru end,
        seo_title_en = case when nullif(seo_title_en, '') is null then ${tr.en.seoTitle ?? null} else seo_title_en end,
        seo_desc_ru = case when nullif(seo_desc_ru, '') is null then ${tr.ru.seoDescription ?? null} else seo_desc_ru end,
        seo_desc_en = case when nullif(seo_desc_en, '') is null then ${tr.en.seoDescription ?? null} else seo_desc_en end
        where id = ${row.id}`;
    } else {
      await sql`update venues set
        name_ru = case when nullif(name_ru, '') is null then ${tr.ru.name} else name_ru end,
        name_en = case when nullif(name_en, '') is null then ${tr.en.name} else name_en end,
        description_ru = case when nullif(description_ru, '') is null then ${tr.ru.description ?? null} else description_ru end,
        description_en = case when nullif(description_en, '') is null then ${tr.en.description ?? null} else description_en end,
        seo_title_ru = case when nullif(seo_title_ru, '') is null then ${tr.ru.seoTitle ?? null} else seo_title_ru end,
        seo_title_en = case when nullif(seo_title_en, '') is null then ${tr.en.seoTitle ?? null} else seo_title_en end,
        seo_desc_ru = case when nullif(seo_desc_ru, '') is null then ${tr.ru.seoDescription ?? null} else seo_desc_ru end,
        seo_desc_en = case when nullif(seo_desc_en, '') is null then ${tr.en.seoDescription ?? null} else seo_desc_en end
        where id = ${row.id}`;
    }
  });
  return pending.length;
}

async function packages() {
  const rows = await sql`select id, name_ro, name_ru, name_en, description_ro,
    description_ru, description_en from artist_packages`;
  const pending = rows.filter((row) =>
    missing(row.name_ru as string | null) || missing(row.name_en as string | null) ||
    (row.description_ro && (missing(row.description_ru as string | null) || missing(row.description_en as string | null))),
  );
  if (!apply) return pending.length;
  await mapLimit(pending, async (row) => {
    const tr = await translate({
      name: row.name_ro as string,
      description: row.description_ro as string | null,
    }, "artist service package");
    await sql`update artist_packages set
      name_ru = case when nullif(name_ru, '') is null then ${tr.ru.name} else name_ru end,
      name_en = case when nullif(name_en, '') is null then ${tr.en.name} else name_en end,
      description_ru = case when nullif(description_ru, '') is null then ${tr.ru.description ?? null} else description_ru end,
      description_en = case when nullif(description_en, '') is null then ${tr.en.description ?? null} else description_en end
      where id = ${row.id}`;
  });
  return pending.length;
}

async function blog() {
  const rows = await sql`select id, title_ro, title_ru, title_en, content_ro,
    content_ru, content_en, excerpt_ro, excerpt_ru, excerpt_en, seo_title_ro,
    seo_title_ru, seo_title_en, seo_desc_ro, seo_desc_ru, seo_desc_en from blog_posts`;
  const pending = rows.filter((row) =>
    missing(row.title_ru as string | null) || missing(row.title_en as string | null) ||
    (row.content_ro && (missing(row.content_ru as string | null) || missing(row.content_en as string | null))) ||
    (row.excerpt_ro && (missing(row.excerpt_ru as string | null) || missing(row.excerpt_en as string | null))) ||
    (row.seo_title_ro && (missing(row.seo_title_ru as string | null) || missing(row.seo_title_en as string | null))) ||
    (row.seo_desc_ro && (missing(row.seo_desc_ru as string | null) || missing(row.seo_desc_en as string | null))),
  );
  if (!apply) return pending.length;
  await mapLimit(pending, async (row) => {
    const tr = await translate({
      title: row.title_ro as string,
      content: row.content_ro as string | null,
      excerpt: row.excerpt_ro as string | null,
      seoTitle: row.seo_title_ro as string | null,
      seoDescription: row.seo_desc_ro as string | null,
    }, "event planning blog article");
    await sql`update blog_posts set
      title_ru = case when nullif(title_ru, '') is null then ${tr.ru.title} else title_ru end,
      title_en = case when nullif(title_en, '') is null then ${tr.en.title} else title_en end,
      content_ru = case when nullif(content_ru, '') is null then ${tr.ru.content ?? null} else content_ru end,
      content_en = case when nullif(content_en, '') is null then ${tr.en.content ?? null} else content_en end,
      excerpt_ru = case when nullif(excerpt_ru, '') is null then ${tr.ru.excerpt ?? null} else excerpt_ru end,
      excerpt_en = case when nullif(excerpt_en, '') is null then ${tr.en.excerpt ?? null} else excerpt_en end,
      seo_title_ru = case when nullif(seo_title_ru, '') is null then ${tr.ru.seoTitle ?? null} else seo_title_ru end,
      seo_title_en = case when nullif(seo_title_en, '') is null then ${tr.en.seoTitle ?? null} else seo_title_en end,
      seo_desc_ru = case when nullif(seo_desc_ru, '') is null then ${tr.ru.seoDescription ?? null} else seo_desc_ru end,
      seo_desc_en = case when nullif(seo_desc_en, '') is null then ${tr.en.seoDescription ?? null} else seo_desc_en end
      where id = ${row.id}`;
  }, 1);
  return pending.length;
}

async function imageAlts() {
  const artistRows = await sql`select id, alt_ro, alt_ru, alt_en from artist_images
    where nullif(alt_ro, '') is not null and (nullif(alt_ru, '') is null or nullif(alt_en, '') is null)`;
  const venueRows = await sql`select id, alt_ro, alt_ru, alt_en from venue_images
    where nullif(alt_ro, '') is not null and (nullif(alt_ru, '') is null or nullif(alt_en, '') is null)`;
  if (!apply) return artistRows.length + venueRows.length;
  await mapLimit(artistRows, async (row) => {
    const tr = await translate({ alt: row.alt_ro as string }, "artist photo alt text");
    await sql`update artist_images set
      alt_ru = case when nullif(alt_ru, '') is null then ${tr.ru.alt} else alt_ru end,
      alt_en = case when nullif(alt_en, '') is null then ${tr.en.alt} else alt_en end where id = ${row.id}`;
  });
  await mapLimit(venueRows, async (row) => {
    const tr = await translate({ alt: row.alt_ro as string }, "venue photo alt text");
    await sql`update venue_images set
      alt_ru = case when nullif(alt_ru, '') is null then ${tr.ru.alt} else alt_ru end,
      alt_en = case when nullif(alt_en, '') is null then ${tr.en.alt} else alt_en end where id = ${row.id}`;
  });
  return artistRows.length + venueRows.length;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (apply && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  const result = {
    categoryNameRepairs: await categoryNameRepairs(),
    categories: await categories(),
    artists: await profiles("artists"),
    venues: await profiles("venues"),
    packages: await packages(),
    blog: await blog(),
    imageAlts: await imageAlts(),
  };
  console.log(apply ? "Backfilled public translations" : "Missing public translations", result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
