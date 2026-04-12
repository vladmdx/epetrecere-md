import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as XLSX from "xlsx";
import * as schema from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql, { schema });

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Category mapping to our DB IDs (will be created/looked up)
const categoryNames: Record<string, { nameRo: string; type: "artist" | "service" }> = {
  "Moderatori": { nameRo: "Moderatori / MC", type: "artist" },
  "DJ's": { nameRo: "DJ", type: "artist" },
  "Сântăreți de estradă": { nameRo: "Cântăreți de Estradă", type: "artist" },
  "Interpreți de muzică populară": { nameRo: "Interpreți Muzică Populară", type: "artist" },
  "Сover band": { nameRo: "Cover Band", type: "artist" },
  "Formații": { nameRo: "Formații / Grupuri", type: "artist" },
  "Instrumentalişti": { nameRo: "Instrumentaliști", type: "artist" },
  "Cvartet": { nameRo: "Cvartet", type: "artist" },
  "Dansatori": { nameRo: "Dansatori", type: "artist" },
  "Dansuri Populare": { nameRo: "Dansuri Populare", type: "artist" },
  "Ansamblu țigănesc": { nameRo: "Ansamblu Țigănesc", type: "artist" },
  "Dans oriental": { nameRo: "Dans Oriental", type: "artist" },
  "Striptiz": { nameRo: "Striptiz", type: "artist" },
  "Show Program": { nameRo: "Show Program", type: "artist" },
  "Iluzionisti / Magicieni": { nameRo: "Iluzioniști / Magicieni", type: "artist" },
  "Show-ul Focului": { nameRo: "Show-ul Focului", type: "artist" },
  "Animatori": { nameRo: "Animatori", type: "artist" },
  "Clovni": { nameRo: "Clovni", type: "artist" },
  "Interesant la sarbatoare": { nameRo: "Interesant la Sărbătoare", type: "artist" },
  "Stand Up": { nameRo: "Stand Up", type: "artist" },
  "Show circus": { nameRo: "Show Circus", type: "artist" },
  "Moș Craciun": { nameRo: "Moș Crăciun", type: "artist" },
  "Echipament Tehnic": { nameRo: "Echipament Tehnic", type: "service" },
  "Foto Video Servicii": { nameRo: "Foto & Video", type: "service" },
  "Foto zona / Selfi zona": { nameRo: "Foto Zonă / Selfie", type: "service" },
};

async function main() {
  console.log("📂 Reading XLSX...");
  const wb = XLSX.readFile("/Users/revencovladislav/Downloads/3741702--artist.md.xlsx");
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets["Sheet0"]);
  console.log(`📊 ${data.length} rows found`);

  // Step 1: Create missing categories
  console.log("\n📁 Creating categories...");
  const catIdMap: Record<string, number> = {};

  // Get existing categories
  const existingCats = await db.select().from(schema.categories);
  for (const cat of existingCats) {
    // Map existing categories by nameRo
    for (const [key, val] of Object.entries(categoryNames)) {
      if (cat.nameRo === val.nameRo || cat.slug === slugify(val.nameRo)) {
        catIdMap[key] = cat.id;
      }
    }
  }

  // Create missing ones
  let sortOrder = existingCats.length + 1;
  for (const [key, val] of Object.entries(categoryNames)) {
    if (!catIdMap[key]) {
      const slug = slugify(val.nameRo);
      const [cat] = await db.insert(schema.categories).values({
        nameRo: val.nameRo,
        nameRu: key, // Original name as RU
        slug: slug + "-" + Date.now(),
        type: val.type,
        isActive: true,
        sortOrder: sortOrder++,
        seoTitleRo: `${val.nameRo} — Evenimente Moldova | ePetrecere.md`,
      }).returning();
      catIdMap[key] = cat.id;
      console.log(`  ✅ Created: ${val.nameRo} (ID: ${cat.id})`);
    } else {
      console.log(`  ⏭️  Exists: ${val.nameRo} (ID: ${catIdMap[key]})`);
    }
  }

  // Step 2: Import artists
  console.log("\n🎵 Importing artists...");
  let imported = 0;
  let errors = 0;
  const usedSlugs = new Set<string>();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = row["Название"]?.trim();
    if (!name) { errors++; continue; }

    const category = row["Категория"];
    const categoryId = catIdMap[category];
    const description = row["Описание"] ? stripHtml(row["Описание"]) : null;
    const shortDesc = row["Краткое описание"] ? stripHtml(row["Краткое описание"]) : null;
    const imageUrl = row["Изображения"] || null;
    const videoUrl = row["Видео"] || null;
    const city = row["Город"] || null;
    const sourceUrl = row["URL"] || null;

    // Generate unique slug
    let slug = slugify(name);
    if (!slug || slug.length < 2) slug = `artist-${i}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${i}`;
    usedSlugs.add(slug);

    try {
      const [artist] = await db.insert(schema.artists).values({
        nameRu: name, // Original name is in Russian
        nameRo: name, // Use same for now, translate later
        slug,
        descriptionRu: description || shortDesc,
        descriptionRo: shortDesc || description?.substring(0, 500),
        categoryIds: categoryId ? [categoryId] : [],
        location: city || "Chișinău",
        isActive: true,
        isVerified: false,
        isFeatured: false,
        isPremium: false,
        calendarEnabled: false,
        website: sourceUrl,
        seoTitleRo: `${name} — Artist Evenimente | ePetrecere.md`,
        seoDescRo: (shortDesc || description || "").substring(0, 155),
      }).returning();

      // Add main image if exists
      if (imageUrl) {
        await db.insert(schema.artistImages).values({
          artistId: artist.id,
          url: imageUrl,
          altRo: `${name} — ePetrecere.md`,
          isCover: true,
          sortOrder: 0,
        });
      }

      // Add video if exists
      if (videoUrl) {
        const platform: "youtube" | "vimeo" = "youtube";
        let videoId = videoUrl;

        if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
          const match = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
          if (match) videoId = match[1];
        }

        await db.insert(schema.artistVideos).values({
          artistId: artist.id,
          platform,
          videoId,
          title: name,
          sortOrder: 0,
        });
      }

      imported++;
      if (imported % 50 === 0) console.log(`  ... ${imported}/${data.length} imported`);
    } catch (err) {
      errors++;
      if (errors <= 5) console.error(`  ❌ Error row ${i + 1} (${name}):`, String(err).substring(0, 100));
    }
  }

  console.log(`\n🎉 Import complete!`);
  console.log(`✅ Imported: ${imported}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📁 Categories: ${Object.keys(catIdMap).length}`);
}

main().catch(console.error);
