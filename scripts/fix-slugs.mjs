/**
 * One-time migration script to fix artist slugs.
 *
 * Existing slugs are transliterations of Russian names.
 * This script regenerates them from the Romanian name (name_ro)
 * and inserts redirect records for the old slugs.
 *
 * Usage: node scripts/fix-slugs.mjs
 * (requires DATABASE_URL in .env.local)
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Slugify — mirrors src/lib/utils/slugify.ts
const roMap = {
  ă: "a", â: "a", î: "i", ș: "s", ş: "s", ț: "t", ţ: "t",
};
const cyMap = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
  ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugify(text) {
  return text
    .toLowerCase()
    .split("")
    .map((c) => roMap[c] || cyMap[c] || c)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

async function main() {
  const artists = await sql`SELECT id, slug, name_ro FROM artists ORDER BY id`;
  console.log(`Found ${artists.length} artists`);

  // Track all new slugs to detect duplicates
  const usedSlugs = new Set();
  // First pass — collect all slugs that won't change
  for (const a of artists) {
    const newSlug = slugify(a.name_ro);
    if (newSlug === a.slug) {
      usedSlugs.add(newSlug);
    }
  }

  let changed = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const a of artists) {
    let newSlug = slugify(a.name_ro);

    if (newSlug === a.slug) {
      usedSlugs.add(newSlug);
      skipped++;
      continue;
    }

    // Handle duplicates by appending id
    if (usedSlugs.has(newSlug)) {
      newSlug = `${newSlug}-${a.id}`;
      duplicates++;
    }
    usedSlugs.add(newSlug);

    console.log(`  ${a.id}: ${a.slug} → ${newSlug} (${a.name_ro})`);

    // Update the slug
    await sql`UPDATE artists SET slug = ${newSlug} WHERE id = ${a.id}`;

    // Insert redirect from old path to new path
    await sql`INSERT INTO redirects (from_path, to_path, status_code)
              VALUES (${`/artisti/${a.slug}`}, ${`/artisti/${newSlug}`}, '301')
              ON CONFLICT DO NOTHING`;

    changed++;
  }

  console.log(`\nDone! Changed: ${changed}, Unchanged: ${skipped}, Duplicates resolved: ${duplicates}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
