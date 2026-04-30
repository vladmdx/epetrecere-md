// Populate page_meta.title + page_meta.description with Romanian SEO copy
// optimized for Moldova / Chișinău. These are admin-editable from /admin/meta;
// the defaults are also hardcoded in each page's metaForPath() call so SEO
// stays sane if a row is deleted.
//
// Run with:
//   DATABASE_URL=... npx tsx scripts/seed-page-meta.ts

import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

interface PageSeed {
  path: string;
  title: string;
  description: string;
}

const PAGES: PageSeed[] = [
  // ── PAGINI ──────────────────────────────────────────────
  {
    path: "/",
    title: "ePetrecere.md — Marketplace Evenimente Moldova",
    description:
      "Găsește artiști, săli și servicii pentru nuntă, cumătrie, botez și corporate în Moldova. Profile verificate, prețuri transparente, rezervare online.",
  },
  {
    path: "/artisti",
    title: "Artiști pentru Nuntă & Evenimente — Chișinău, Moldova",
    description:
      "Cei mai buni artiști din Moldova pentru nuntă, cumătrie, botez și corporate. DJ-i, formații, cântăreți, dansatori, animatori. Calendar live, prețuri reale.",
  },
  {
    path: "/sali",
    title: "Săli & Restaurante pentru Nuntă în Moldova",
    description:
      "Descoperă cele mai bune săli de evenimente din Chișinău, Bălți și restul Moldovei. Capacități, meniuri, prețuri și disponibilitate live pe ePetrecere.md.",
  },
  {
    path: "/servicii",
    title: "Servicii pentru Evenimente în Moldova — Foto, Decor, Echipament",
    description:
      "Toate serviciile pentru evenimentul tău: fotografi, videografi, decor, echipament tehnic, cabine foto. Furnizori verificați din Chișinău și Moldova.",
  },
  {
    path: "/categorii",
    title: "Toate Categoriile de Artiști și Servicii — ePetrecere.md",
    description:
      "Descoperă toate categoriile de artiști și servicii pentru evenimentul tău în Moldova: DJ, cântăreți, formații, fotografi, decor, animatori și multe altele.",
  },
  {
    path: "/blog",
    title: "Blog Evenimente Moldova — Sfaturi pentru Nuntă & Cumătrie",
    description:
      "Sfaturi, idei și inspirație pentru organizarea evenimentelor în Moldova. Ghiduri pentru nuntă, cumătrie, botez și corporate de la profesioniști.",
  },
  {
    path: "/contact",
    title: "Contact — ePetrecere.md, Marketplace Evenimente Moldova",
    description:
      "Contactează echipa ePetrecere.md pentru întrebări despre platformă, parteneriate sau suport. Răspuns rapid prin email, telefon sau formular.",
  },
  {
    path: "/despre",
    title: "Despre Noi — ePetrecere.md, Platforma de Evenimente",
    description:
      "Cunoaște echipa ePetrecere.md — cea mai mare platformă de evenimente din Republica Moldova. Misiunea noastră: organizare simplă, parteneri verificați.",
  },
  {
    path: "/planifica",
    title: "Planifică Evenimentul Tău Online în 8 Pași — Moldova",
    description:
      "Planifică nunta, cumătria sau evenimentul corporate în 8 pași simpli. Recomandări de artiști, săli și servicii bazate pe data, bugetul și preferințele tale.",
  },

  // ── UTILITĂȚI ───────────────────────────────────────────
  {
    path: "/utilitati",
    title: "Utilități pentru Evenimente — ePetrecere.md",
    description:
      "Toate instrumentele de care ai nevoie pentru a-ți organiza evenimentul în Moldova: checklist, buget, invitații electronice, listă invitați și calculatoare. Gratuit.",
  },
  {
    path: "/utilitati/checklist",
    title: "Checklist Nuntă & Eveniment Online — ePetrecere.md",
    description:
      "Checklist complet pentru organizarea nunții, cumătriei sau botezului în Moldova. Sarcini cu termen, prioritate, progres salvat. Gratuit pe ePetrecere.md.",
  },
  {
    path: "/utilitati/budget",
    title: "Buget Nuntă Online — Calculator Cheltuieli Moldova",
    description:
      "Urmărește bugetul nunții sau evenimentului tău în Moldova. Adaugă cheltuieli, vezi categoriile depășite, exportă raportul. Gratuit pe ePetrecere.md.",
  },
  {
    path: "/utilitati/invitatii-electronice",
    title: "Invitații Electronice Nuntă & Cumătrie în Moldova",
    description:
      "Creează invitații electronice profesioniste pentru nuntă, cumătrie sau botez în Moldova. Design elegant, RSVP online, link partajabil pe WhatsApp.",
  },
  {
    path: "/utilitati/lista-invitati",
    title: "Listă Invitați Nuntă + Așezare Mese Online — Moldova",
    description:
      "Gestionează lista invitaților și așezarea la mese pentru nunta sau evenimentul tău în Moldova. Drag & drop, RSVP, mesaje în masă. ePetrecere.md.",
  },
  {
    path: "/utilitati/momente-eveniment",
    title: "Momente Eveniment & Galerie Foto Nuntă — Moldova",
    description:
      "Colectează poze de la invitații nunții sau evenimentului tău în Moldova. Galerie comună, link partajabil, descărcare instant pe ePetrecere.md.",
  },

  // ── INSTRUMENTE / CALCULATOARE ──────────────────────────
  {
    path: "/calculatoare",
    title: "Calculatoare pentru Evenimente Moldova — Buget, Invitați, Băuturi",
    description:
      "Calculează bugetul nunții, numărul de invitați, cantitățile de băuturi și meniul pentru evenimentul tău în Moldova. Estimări gratuite pe baza prețurilor reale.",
  },
  {
    path: "/calculatoare/buget",
    title: "Calculator Buget Nuntă & Cumătrie Moldova — Estimare Online",
    description:
      "Calculează bugetul exact pentru nuntă, cumătrie sau botez în Moldova. Meniu, artiști, decor, foto-video, transport. Prețuri reale 2026 pe ePetrecere.md.",
  },
  {
    path: "/calculatoare/invitati",
    title: "Calculator Invitați, Mese și Logistică pentru Nuntă",
    description:
      "Câte mese, ospătari, băi și locuri de parcare îți trebuie? Calculator gratuit pentru nunți și evenimente în Moldova bazat pe formule verificate.",
  },
  {
    path: "/calculatoare/dar-nunta",
    title: "Cât să Dau Dar la Nuntă în Moldova? — Calculator 2026",
    description:
      "Calculator dar nuntă Moldova 2026 — sumă recomandată în funcție de relația cu mirii, oraș, tipul mesei și dacă vii solo, cuplu sau cu familia.",
  },
  {
    path: "/calculatoare/nunta",
    title: "Calculator Cost Nuntă Moldova 2026 — Estimare Totală",
    description:
      "Estimare reală a costului total al unei nunți în Moldova 2026. Sala, meniu, artiști, foto-video, decor, vestimentație. Bazat pe prețuri actuale din Chișinău.",
  },
  {
    path: "/calculatoare/alcool",
    title: "Calculator Băuturi pentru Nuntă — Vin, Vodcă, Coniac",
    description:
      "Câte sticle de vin, vodcă, coniac, șampanie și apă îți trebuie pentru nuntă? Calculator gratuit cu cantități recomandate per invitat în Moldova.",
  },
  {
    path: "/calculatoare/meniu",
    title: "Calculator Meniu Nuntă, Botez, Cumătrie — Cantități",
    description:
      "Calculator meniu pentru nuntă, botez și cumătrie în Moldova. Aperitive, fel principal, desert — cantități realiste per invitat. Estimare gratuită.",
  },
];

async function run() {
  console.log(`Seeding title + description for ${PAGES.length} pages...`);
  let updated = 0;
  let inserted = 0;
  for (const p of PAGES) {
    const existing = await sql`SELECT id FROM page_meta WHERE path = ${p.path} LIMIT 1`;
    if (existing.length === 0) {
      await sql`
        INSERT INTO page_meta (path, label, title, description)
        VALUES (${p.path}, ${p.title.slice(0, 40)}, ${p.title}, ${p.description})
      `;
      inserted++;
      console.log(`  + ${p.path}  → inserted`);
    } else {
      await sql`
        UPDATE page_meta SET title = ${p.title}, description = ${p.description}, updated_at = NOW() WHERE path = ${p.path}
      `;
      updated++;
      console.log(`  ↻ ${p.path}  → updated`);
    }
  }
  console.log(`\nDone. ${updated} updated, ${inserted} inserted.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
