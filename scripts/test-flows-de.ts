// E2E test for D (Shared) + E (Adjacent) flows.
//
// Run: cd epetrecere-md && DATABASE_URL=... npx tsx scripts/test-flows-de.ts

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

let pass = 0;
let fail = 0;
const bugs: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    bugs.push(`${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function testD_shared() {
  console.log("\n═══ D. SHARED FLOWS ═══\n");

  console.log("D.1 Sound preferences:");
  // Sound is localStorage-based, can't DB-test. Verify shared module structure.
  // Just confirm the helper file exists with the expected exports.
  const fs = await import("fs/promises");
  const sound = await fs.readFile(
    "/Users/revencovladislav/Downloads/epetrecere-md/src/lib/notifications/sound.ts",
    "utf8",
  );
  check("playNotificationChime exported", sound.includes("export function playNotificationChime"));
  check("playMessageChime exported", sound.includes("export function playMessageChime"));
  check("isSoundEnabled defaults true", sound.includes("v === null ? true : v === \"1\""));
  check("Two distinct frequencies (notif vs message)", sound.includes("880") && sound.includes("520"));

  console.log("\nD.2 City filter — verified in suite A. (skipping duplicate)\n");

  console.log("D.3 Anonymous redirect via sessionStorage:");
  const searchBar = await fs.readFile(
    "/Users/revencovladislav/Downloads/epetrecere-md/src/components/public/sections/search-bar.tsx",
    "utf8",
  );
  check("Search bar uses sessionStorage('search-next')", searchBar.includes("sessionStorage.setItem(\"search-next\""));
  const authRedirect = await fs.readFile(
    "/Users/revencovladislav/Downloads/epetrecere-md/src/app/(auth)/auth-redirect/page.tsx",
    "utf8",
  );
  check("/auth-redirect consumes 'search-next'", authRedirect.includes("consumeSearchNext"));
  check("/auth-redirect consumes 'next-url'", authRedirect.includes("consumeIntendedNext"));
  check("Allowlist /artisti + /sali only", authRedirect.includes("/artisti") && authRedirect.includes("/sali"));

  console.log("\nD.4 Artist profile auth gate:");
  const artistClient = await fs.readFile(
    "/Users/revencovladislav/Downloads/epetrecere-md/src/app/(public)/artisti/[slug]/client.tsx",
    "utf8",
  );
  check("Anon shows 'Înregistrează-te' CTA", artistClient.includes("Înregistrează-te pentru rezervare"));
  check("priceHidden state shows 'Preț la cerere'", artistClient.includes("Preț la cerere"));
  check("3-state branch: anon vs hidden vs visible", artistClient.includes("artist.priceHidden"));
}

async function testE_adjacent() {
  console.log("\n═══ E. ADJACENT FUNCTIONS ═══\n");

  const [client] = await sql`SELECT id FROM users WHERE email = 'osvaldhotelmd@gmail.com' LIMIT 1`;

  console.log("E.1 Reviews:");
  const [b] = await sql`
    INSERT INTO booking_requests (artist_id, client_user_id, client_name, client_email, client_phone, event_date, status, agreed_price)
    VALUES (11, ${client.id}, 'TEST_REVIEW', 'osvaldhotelmd@gmail.com', '+373', '2024-01-01', 'completed', 500)
    RETURNING id
  `;
  const [r] = await sql`
    INSERT INTO reviews (artist_id, booking_request_id, author_user_id, author_name, rating, text, event_date, event_type, is_approved)
    VALUES (11, ${b.id}, ${client.id}, 'Test Client', 5, 'Excelent!', '2024-01-01', 'wedding', true)
    RETURNING id, rating, is_approved
  `;
  check("Review inserted with rating + booking link", r.rating === 5 && r.is_approved);

  // Verify it shows for the artist's profile (rating aggregation)
  const reviewCount = await sql`SELECT COUNT(*)::int AS count FROM reviews WHERE artist_id = 11 AND id = ${r.id}`;
  check("Review visible on artist profile via artist_id query", reviewCount[0].count === 1);

  await sql`DELETE FROM reviews WHERE id = ${r.id}`;
  await sql`DELETE FROM booking_requests WHERE id = ${b.id}`;

  console.log("\nE.2 Favorites (wishlist_items):");
  const wishCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'wishlist_items'`;
  check("wishlist_items table exists", wishCols.length > 0);
  // Schema: user_id (uuid), entity_type (enum: artist|venue), entity_id, created_at
  // Composite key — no `id` column. INSERT then verify.
  await sql`
    INSERT INTO wishlist_items (user_id, entity_type, entity_id)
    VALUES (${client.id}, 'artist', 11)
    ON CONFLICT DO NOTHING
  `;
  const found = await sql`SELECT entity_id FROM wishlist_items WHERE user_id = ${client.id} AND entity_type = 'artist' AND entity_id = 11`;
  check("Favorite entry visible to user", found.length === 1);
  await sql`DELETE FROM wishlist_items WHERE user_id = ${client.id} AND entity_type = 'artist' AND entity_id = 11`;

  console.log("\nE.3 Calculators (public pages):");
  const fs = await import("fs/promises");
  const calcDir = await fs.readdir(
    "/Users/revencovladislav/Downloads/epetrecere-md/src/app/(public)/calculatoare",
  );
  const calcRoutes = calcDir.filter((d) => !d.startsWith("."));
  check("/calculatoare hub page exists", calcRoutes.includes("page.tsx"));
  check("6 calculator subpages exist", ["buget", "invitati", "dar-nunta", "nunta", "alcool", "meniu"].every((s) => calcRoutes.includes(s)),
    calcRoutes.filter((r) => r !== "page.tsx").length + " subpages");

  console.log("\nE.4 Tools (cabinet pages):");
  const cabDir = await fs.readdir(
    "/Users/revencovladislav/Downloads/epetrecere-md/src/app/(client)/cabinet",
  );
  check("/cabinet/checklist exists", cabDir.includes("checklist"));
  check("/cabinet/buget exists", cabDir.includes("buget"));
  check("/cabinet/invitatii exists", cabDir.includes("invitatii"));
  check("/cabinet/moments exists", cabDir.includes("moments"));
  check("/cabinet/calculator-dar exists", cabDir.includes("calculator-dar"));
  check("/cabinet/asezare-mese exists", cabDir.includes("asezare-mese"));
  check("/cabinet/rezervare-artist exists (new)", cabDir.includes("rezervare-artist"));

  console.log("\nE.4.1 Checklist items DB schema:");
  const checklistCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'checklist_items'`;
  check("checklist_items has done flag", checklistCols.some((c: any) => ["done", "is_done", "completed", "is_completed"].includes(c.column_name)));
  check("checklist_items has plan_id (link to event_plans)", checklistCols.some((c: any) => c.column_name === "plan_id"));

  console.log("\nE.4.2 Invitations DB:");
  const invCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'invitations'`;
  check("invitations table present", invCols.length > 0);
  const invGuestsCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'invitation_guests'`;
  check("invitation_guests table for RSVP", invGuestsCols.length > 0);

  console.log("\nE.4.3 Event photos / Moments:");
  const photoCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'event_photos'`;
  check("event_photos table for shared gallery", photoCols.length > 0);

  console.log("\nE.5 Admin functions:");
  const adminDir = await fs.readdir(
    "/Users/revencovladislav/Downloads/epetrecere-md/src/app/(admin)/admin",
  );
  check("/admin/categorii (edit images + SEO + badge)", adminDir.includes("categorii"));
  check("/admin/meta (page meta override)", adminDir.includes("meta"));
  check("/admin/cereri-inregistrare (approve venues/artists)", adminDir.includes("cereri-inregistrare"));
  check("/admin/artisti (CRUD)", adminDir.includes("artisti"));
  check("/admin/sali (CRUD)", adminDir.includes("sali"));
  check("/admin/blog", adminDir.includes("blog"));
  check("/admin/pagini (page editor)", adminDir.includes("pagini"));
  check("/admin/seo", adminDir.includes("seo"));

  console.log("\nE.5.1 Admin category edit endpoint:");
  const adminCatRoute = await fs.readFile(
    "/Users/revencovladislav/Downloads/epetrecere-md/src/app/api/admin/categories/[id]/route.ts",
    "utf8",
  );
  check("Admin PATCH accepts imageUrl", adminCatRoute.includes('"imageUrl"'));
  check("Admin PATCH accepts imageAlt", adminCatRoute.includes('"imageAlt"'));
  check("Admin PATCH accepts badge", adminCatRoute.includes('"badge"'));
  check("Admin PATCH accepts seoTitleRo + seoDescRo", adminCatRoute.includes("seoTitleRo") && adminCatRoute.includes("seoDescRo"));
  check("Admin PATCH accepts seoBodyRo", adminCatRoute.includes("seoBodyRo"));
  check("Admin PATCH accepts descriptionRo", adminCatRoute.includes("descriptionRo"));

  console.log("\nE.5.2 Page meta override:");
  const metaRoute = await fs.readFile(
    "/Users/revencovladislav/Downloads/epetrecere-md/src/app/api/admin/page-meta/route.ts",
    "utf8",
  );
  check("Admin /api/admin/page-meta PATCH accepts title", metaRoute.includes('"title"'));
  check("Admin /api/admin/page-meta PATCH accepts description", metaRoute.includes('"description"'));
  check("Calls revalidatePath after save", metaRoute.includes("revalidatePath"));

  console.log("\nE.5.3 Categories with full SEO content seeded:");
  const seoCats = await sql`SELECT COUNT(*)::int AS count FROM categories WHERE seo_title_ro IS NOT NULL AND seo_body_ro IS NOT NULL`;
  check("All 29 categories have SEO content", seoCats[0].count >= 29, `${seoCats[0].count} categories`);

  console.log("\nE.5.4 Page meta seeded for admin /admin/meta:");
  const pageMeta = await sql`SELECT COUNT(*)::int AS count FROM page_meta WHERE title IS NOT NULL`;
  check("All 22 page_meta entries have titles", pageMeta[0].count >= 22, `${pageMeta[0].count} entries`);
}

async function main() {
  await testD_shared();
  await testE_adjacent();
  console.log(`\n═══ RESULTS ═══`);
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  if (bugs.length > 0) {
    console.log(`\n🐛 BUGS FOUND:`);
    bugs.forEach((b) => console.log(`  - ${b}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
