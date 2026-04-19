// Single source of truth for mapping wizard service IDs (used on the
// /planifica flow) to real category slugs in the DB. The wizard posts
// service-string ids like "singer" / "dj" / "show" — the API and the
// results page translate those to category IDs via this map before
// hitting the artists table.
//
// Keep the values in sync with the `slug` column in the `categories`
// table. Mismatches silently drop filters, which is exactly the bug
// that made plan 38 save only Cântăreți + Fotografi when the user
// picked 4+ services.

export const SERVICE_TO_CATEGORY_SLUG: Record<string, string> = {
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
  // candy_bar and fireworks currently have no matching categories in
  // the DB — leave them unmapped. The wizard still records them on the
  // lead message but the discovery grid won't render a section.
};

/** Human-readable labels for wizard service ids. */
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
