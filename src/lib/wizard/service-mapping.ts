// Single source of truth for mapping wizard service IDs (used on the
// /planifica flow) to real category slugs in the DB. The wizard posts
// service-string ids — historically aliases like "singer" / "dj" / "show",
// now also raw slugs like "cantareti" / "iluzionisti-magicieni" — and the
// API + results page translate them to category IDs via this map before
// hitting the artists table.
//
// Identity entries (slug → same slug) are required so newly-added DB
// categories work without a code change. Legacy alias entries are kept so
// older event_plans (saved before the wizard switched to slug-based ids)
// continue to resolve.

export const SERVICE_TO_CATEGORY_SLUG: Record<string, string> = {
  // ── Legacy aliases (pre-2026-04 wizard) ──
  singer: "cantareti",
  mc: "moderatori",
  dj: "dj",
  photographer: "fotografi",
  videographer: "videografi",
  band: "formatii",
  show: "show-program",
  decor: "decor",
  animators: "animatori",
  equipment: "echipament-tehnic",
  // candy_bar and fireworks have no DB-category equivalents — leave
  // unmapped. The wizard still records them in the lead message.

  // ── Identity entries (current wizard sends slug directly) ──
  // Music
  moderatori: "moderatori",
  cantareti: "cantareti",
  "cantareti-de-estrada": "cantareti-de-estrada",
  "interpreti-muzica-populara": "interpreti-muzica-populara",
  formatii: "formatii",
  "cover-band": "cover-band",
  instrumentalisti: "instrumentalisti",
  cvartet: "cvartet",
  // Dance
  dansatori: "dansatori",
  "dansuri-populare": "dansuri-populare",
  "ansamblu-tiganesc": "ansamblu-tiganesc",
  "dans-oriental": "dans-oriental",
  striptiz: "striptiz",
  // Show
  "show-program": "show-program",
  "iluzionisti-magicieni": "iluzionisti-magicieni",
  "show-ul-focului": "show-ul-focului",
  clovni: "clovni",
  "interesant-la-sarbatoare": "interesant-la-sarbatoare",
  "show-circus": "show-circus",
  "stand-up": "stand-up",
  "mos-craciun": "mos-craciun",
  // Services
  fotografi: "fotografi",
  videografi: "videografi",
  "foto-video": "foto-video",
  "foto-zona-selfie": "foto-zona-selfie",
  "echipament-tehnic": "echipament-tehnic",
};

/** Human-readable labels for legacy wizard service ids. New ids use the
 *  category's `nameRo` directly from the DB, so this only needs to cover
 *  the historical aliases above. */
export const SERVICE_LABELS: Record<string, string> = {
  singer: "Cântăreți",
  mc: "Moderatori / MC",
  dj: "DJ",
  photographer: "Fotografi",
  videographer: "Videografi",
  band: "Formații / Band",
  show: "Show / Dans",
  decor: "Decor / Floristică",
  candy_bar: "Candy Bar / Tort",
  fireworks: "Foc de artificii",
  animators: "Animatori",
  equipment: "Echipament tehnic",
};
