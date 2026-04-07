import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Copy .env.local.example to .env.local and fill in values.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });

  console.log("🌱 Seeding database...");

  // Categories
  const categoryData = [
    { nameRo: "Moderatori / MC", nameRu: "Ведущие", nameEn: "MCs / Hosts", slug: "moderatori", type: "artist" as const, icon: "mic", priceFrom: 200, sortOrder: 1 },
    { nameRo: "DJ", nameRu: "DJ", nameEn: "DJ", slug: "dj", type: "artist" as const, icon: "disc-3", priceFrom: 150, sortOrder: 2 },
    { nameRo: "Cântăreți", nameRu: "Певцы/Исполнители", nameEn: "Singers", slug: "cantareti", type: "artist" as const, icon: "music", priceFrom: 300, sortOrder: 3 },
    { nameRo: "Formații / Grupuri", nameRu: "Группы", nameEn: "Bands", slug: "formatii", type: "artist" as const, icon: "guitar", priceFrom: 500, sortOrder: 4 },
    { nameRo: "Fotografi", nameRu: "Фотографы", nameEn: "Photographers", slug: "fotografi", type: "service" as const, icon: "camera", priceFrom: 200, sortOrder: 5 },
    { nameRo: "Videografi", nameRu: "Видеографы", nameEn: "Videographers", slug: "videografi", type: "service" as const, icon: "video", priceFrom: 250, sortOrder: 6 },
    { nameRo: "Decor & Floristică", nameRu: "Декор и Флористика", nameEn: "Decor & Floristry", slug: "decor", type: "service" as const, icon: "palette", priceFrom: 100, sortOrder: 7 },
    { nameRo: "Animatori", nameRu: "Аниматоры", nameEn: "Animators", slug: "animatori", type: "artist" as const, icon: "party-popper", priceFrom: 100, sortOrder: 8 },
    { nameRo: "Echipament Tehnic", nameRu: "Техническое оборудование", nameEn: "Technical Equipment", slug: "echipament", type: "service" as const, icon: "speaker", priceFrom: 100, sortOrder: 9 },
    { nameRo: "Show Program", nameRu: "Шоу Программа", nameEn: "Show Program", slug: "show-program", type: "artist" as const, icon: "star", priceFrom: 200, sortOrder: 10 },
  ];

  for (const cat of categoryData) {
    await db.insert(schema.categories).values({
      ...cat,
      isActive: true,
      seoTitleRo: `${cat.nameRo} pentru Evenimente | ePetrecere.md`,
      seoDescRo: `Găsește cei mai buni ${cat.nameRo.toLowerCase()} pentru evenimentul tău în Republica Moldova. Prețuri de la ${cat.priceFrom}€.`,
    });
  }
  console.log(`✅ ${categoryData.length} categorii create`);

  // Artists
  const artistData = [
    { nameRo: "Ion Suruceanu", slug: "ion-suruceanu", categoryIds: [3], priceFrom: 1000, location: "Chișinău", descriptionRo: "Unul dintre cei mai iubiți cântăreți din Republica Moldova, cu o carieră de peste 30 de ani." },
    { nameRo: "Zdob și Zdub", slug: "zdob-si-zdub", categoryIds: [4], priceFrom: 2000, location: "Chișinău", descriptionRo: "Trupa emblematică a Moldovei, cunoscută internațional pentru stilul unic de rock moldovenesc." },
    { nameRo: "DJ Andrei", slug: "dj-andrei", categoryIds: [2], priceFrom: 200, location: "Chișinău", descriptionRo: "DJ profesionist cu experiență vastă în evenimente private și corporate." },
    { nameRo: "Cleopatra Stratan", slug: "cleopatra-stratan", categoryIds: [3], priceFrom: 1500, location: "Chișinău", descriptionRo: "Artistă tânără și talentată cu voce excepțională și repertoriu diversificat." },
    { nameRo: "MC Vitalie", slug: "mc-vitalie", categoryIds: [1], priceFrom: 300, location: "Chișinău", descriptionRo: "Moderator profesionist pentru nunți, botezuri și evenimente corporate." },
    { nameRo: "Foto Studio Elite", slug: "foto-studio-elite", categoryIds: [5], priceFrom: 250, location: "Chișinău", descriptionRo: "Studio foto profesional specializat în fotografia de eveniment." },
    { nameRo: "Band Alegria", slug: "band-alegria", categoryIds: [4], priceFrom: 800, location: "Bălți", descriptionRo: "Formație versatilă care acoperă toate genurile muzicale pentru evenimentul tău perfect." },
    { nameRo: "Lăutarii din Chișinău", slug: "lautarii-din-chisinau", categoryIds: [3, 4], priceFrom: 600, location: "Chișinău", descriptionRo: "Ansamblul folcloric cu tradiție, ideal pentru nunți moldovenești autentice." },
    { nameRo: "DJ Maria Sound", slug: "dj-maria-sound", categoryIds: [2], priceFrom: 250, location: "Chișinău", descriptionRo: "DJ feminină cu energie pozitivă și o selecție muzicală pentru toate gusturile." },
    { nameRo: "Video Art Production", slug: "video-art-production", categoryIds: [6], priceFrom: 300, location: "Chișinău", descriptionRo: "Servicii video profesionale cu echipament de ultimă generație." },
  ];

  for (const artist of artistData) {
    await db.insert(schema.artists).values({
      ...artist,
      isActive: true,
      isFeatured: artistData.indexOf(artist) < 4,
      isVerified: artistData.indexOf(artist) < 6,
      priceCurrency: "EUR",
      calendarEnabled: false,
      seoTitleRo: `${artist.nameRo} — Artist pentru Evenimente | ePetrecere.md`,
      seoDescRo: artist.descriptionRo?.substring(0, 155),
    });
  }
  console.log(`✅ ${artistData.length} artiști creați`);

  // Venues
  const venueData = [
    { nameRo: "Restaurant Codru", slug: "restaurant-codru", address: "Str. 31 August 115", city: "Chișinău", capacityMin: 50, capacityMax: 300, pricePerPerson: 35, descriptionRo: "Restaurant elegant în centrul Chișinăului cu o tradiție de peste 20 de ani." },
    { nameRo: "Chateau Vartely Events", slug: "chateau-vartely-events", address: "Orhei, Vinăria Château Vartely", city: "Orhei", capacityMin: 100, capacityMax: 500, pricePerPerson: 45, descriptionRo: "Locație unică de eveniment la vinăria premium Château Vartely." },
    { nameRo: "Sala de Ceremonii La Plăcinte", slug: "la-placinte-ceremonie", address: "Str. Columna 202", city: "Chișinău", capacityMin: 30, capacityMax: 150, pricePerPerson: 25, descriptionRo: "Sala de ceremonii cu atmosferă caldă și bucătărie tradițională moldovenească." },
  ];

  for (const venue of venueData) {
    await db.insert(schema.venues).values({
      ...venue,
      isActive: true,
      isFeatured: true,
      calendarEnabled: false,
      facilities: ["Parcare", "WiFi", "Aer condiționat", "Scenă"],
      seoTitleRo: `${venue.nameRo} — Sală Evenimente ${venue.city} | ePetrecere.md`,
      seoDescRo: venue.descriptionRo?.substring(0, 155),
    });
  }
  console.log(`✅ ${venueData.length} săli create`);

  // Homepage sections
  const sections = [
    { type: "hero" as const, sortOrder: 1, config: { title_ro: "Planifică-ți Evenimentul Perfect", video_url: null, stats: [{ label: "Artiști", value: "500+" }, { label: "Evenimente", value: "200+" }, { label: "Ani experiență", value: "12" }] } },
    { type: "search_bar" as const, sortOrder: 2, config: {} },
    { type: "categories" as const, sortOrder: 3, config: { count: 12 } },
    { type: "featured_artists" as const, sortOrder: 4, config: { count: 8 } },
    { type: "event_planner" as const, sortOrder: 5, config: {} },
    { type: "featured_venues" as const, sortOrder: 6, config: { count: 6 } },
    { type: "process" as const, sortOrder: 7, config: {} },
    { type: "testimonials" as const, sortOrder: 8, config: {} },
    { type: "stats" as const, sortOrder: 9, config: {} },
    { type: "blog" as const, sortOrder: 10, config: { count: 3 } },
    { type: "cta" as const, sortOrder: 11, config: {} },
  ];

  for (const section of sections) {
    await db.insert(schema.homepageSections).values({
      ...section,
      isVisible: true,
    });
  }
  console.log(`✅ ${sections.length} secțiuni homepage create`);

  // Site settings
  const settings = [
    { key: "theme_colors", value: { gold: "#C9A84C", bg_dark: "#0D0D0D", bg_light: "#FAF8F2" } },
    { key: "fonts", value: { heading: "Playfair Display", body: "DM Sans", accent: "Cormorant Garamond" } },
    { key: "contact_info", value: { phone: "+373 60 123 456", email: "info@epetrecere.md", address: "Chișinău, Republica Moldova" } },
    { key: "social_links", value: { instagram: "", facebook: "", youtube: "", tiktok: "", telegram: "" } },
    { key: "seo_defaults", value: { default_language: "ro", active_languages: ["ro", "ru", "en"] } },
  ];

  for (const setting of settings) {
    await db.insert(schema.siteSettings).values(setting);
  }
  console.log(`✅ ${settings.length} setări create`);

  console.log("\n🎉 Seed complet!");
}

seed().catch(console.error);
