// Static metadata layered on top of the dynamic categories table:
//   - emoji icon for the wizard card (the DB stores a single optional `icon`
//     field but most categories don't have one filled, and Lucide imports
//     bloat client bundles, so we use plain unicode emojis)
//   - "allowed event types" filter — which event types should surface this
//     category on the planifica wizard. e.g. Stand Up shouldn't show on
//     Cumătrie or Botez where the audience is family-oriented.
//
// The keys are category SLUGS (single source of truth — slugs are stable,
// IDs differ between environments). Anything not listed here defaults to
// "all event types allowed" so a new category added in the admin panel
// shows up everywhere without code changes.

export type EventTypeKey =
  | "wedding"
  | "proposal"
  | "cununie"
  | "baptism"
  | "cumatrie"
  | "birthday"
  | "kids_birthday"
  | "corporate"
  | "concert"
  | "other";

/**
 * Ordered as a visitor thinks about them, not alphabetically: the wedding
 * pair first, then the family celebrations, then birthdays, then the rest.
 * This order drives the wizard tiles and every picker built from the list.
 *
 * `cununie` is the ceremony itself, which people in Moldova often organise
 * separately from the party, and `kids_birthday` is a different job from an
 * adult one — different performers, different venue, no bar.
 */
export const ALL_EVENT_TYPES: EventTypeKey[] = [
  "wedding",
  "proposal",
  "cununie",
  "baptism",
  "cumatrie",
  "birthday",
  "kids_birthday",
  "corporate",
  "concert",
  "other",
];

interface CategoryMeta {
  /** Emoji shown on the wizard tile. Falls back to 🎤 for unknowns. */
  emoji: string;
  /** Event types where this category makes sense to recommend. */
  allowedEventTypes: EventTypeKey[];
}

// ADULT = no minors, broader entertainment options OK. Deliberately excludes
// kids_birthday and cununie — one has children in the room, the other is a
// ceremony.
const ADULT = ["wedding", "corporate", "birthday", "other"] as const;
// VENUE_NEUTRAL = anything except concerts (which have specific staging needs)
const VENUE_NEUTRAL = [
  "wedding",
  "cununie",
  "baptism",
  "cumatrie",
  "corporate",
  "birthday",
  "other",
] as const;
// KIDS = safe and wanted at a children's party. Kept separate rather than
// folded into VENUE_NEUTRAL because most of what suits a wedding reception —
// a live band, a gypsy ensemble, a fire show — is wrong for a room full of
// eight-year-olds.
const KIDS = ["kids_birthday"] as const;
// PROPOSAL = the short, private list that suits a marriage proposal: the
// moment is for two people, so a band, a host or a venue package would be
// out of place, but a photographer, a violinist and flowers are the point.
const PROPOSAL = ["proposal"] as const;

export const CATEGORY_META: Record<string, CategoryMeta> = {
  // ── Music ─────────────────────────────────────────
  moderatori: { emoji: "🎤", allowedEventTypes: [...VENUE_NEUTRAL, "concert", ...KIDS] },
  dj: { emoji: "🎧", allowedEventTypes: ["wedding", "corporate", "birthday", "other", ...KIDS] },
  cantareti: {
    emoji: "🎙️",
    // Excluded from baptism — religious ceremony, no secular performers.
    allowedEventTypes: ["wedding", "cumatrie", "corporate", "birthday", "concert", "other", ...PROPOSAL],
  },
  "cantareti-de-estrada": { emoji: "🎤", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "interpreti-muzica-populara": { emoji: "🪗", allowedEventTypes: [...VENUE_NEUTRAL, "concert"] },
  formatii: { emoji: "🎸", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "cover-band": { emoji: "🎼", allowedEventTypes: [...ALL_EVENT_TYPES] },
  instrumentalisti: { emoji: "🎻", allowedEventTypes: [...ALL_EVENT_TYPES] },
  cvartet: { emoji: "🎻", allowedEventTypes: [...VENUE_NEUTRAL, "concert", ...PROPOSAL] },

  // ── Dance ─────────────────────────────────────────
  dansatori: { emoji: "💃", allowedEventTypes: [...ADULT, "baptism", "cumatrie", ...KIDS] },
  "dansuri-populare": { emoji: "🩰", allowedEventTypes: [...VENUE_NEUTRAL] },
  "ansamblu-tiganesc": { emoji: "🎺", allowedEventTypes: [...VENUE_NEUTRAL] },
  "dans-oriental": { emoji: "🪩", allowedEventTypes: [...ADULT] },
  striptiz: { emoji: "🔥", allowedEventTypes: ["birthday", "other"] }, // private parties only

  // ── Show ──────────────────────────────────────────
  "show-program": { emoji: "🎭", allowedEventTypes: [...VENUE_NEUTRAL, ...KIDS] },
  "iluzionisti-magicieni": { emoji: "🎩", allowedEventTypes: [...VENUE_NEUTRAL, ...KIDS] },
  animatori: { emoji: "🎈", allowedEventTypes: ["baptism", "cumatrie", "birthday", "other", ...KIDS] }, // kids
  "show-ul-focului": { emoji: "🔥", allowedEventTypes: ["wedding", "corporate", "birthday", "other", ...PROPOSAL] },
  clovni: { emoji: "🤡", allowedEventTypes: ["birthday", "other", ...KIDS] }, // kids birthdays only
  "interesant-la-sarbatoare": { emoji: "✨", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "show-circus": { emoji: "🎪", allowedEventTypes: [...VENUE_NEUTRAL, ...KIDS] },
  "stand-up": { emoji: "🎙️", allowedEventTypes: ["corporate", "birthday", "other"] },
  "mos-craciun": { emoji: "🎅", allowedEventTypes: ["corporate", "birthday", "other", ...KIDS] }, // winter only

  // ── Services (foto/video/decor/tech) ──────────────
  fotografi: { emoji: "📸", allowedEventTypes: [...ALL_EVENT_TYPES] },
  videografi: { emoji: "🎥", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "foto-video": { emoji: "🎬", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "foto-zona-selfie": { emoji: "🤳", allowedEventTypes: [...VENUE_NEUTRAL, ...KIDS] },
  decor: { emoji: "🌸", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "echipament-tehnic": { emoji: "🔊", allowedEventTypes: [...ALL_EVENT_TYPES] },
};

export function getCategoryEmoji(slug: string): string {
  return CATEGORY_META[slug]?.emoji ?? "🎤";
}

/** Whether a given category should appear on the wizard for this event type. */
export function isCategoryAllowedForEvent(
  slug: string,
  eventType: string,
): boolean {
  const meta = CATEGORY_META[slug];
  if (!meta) return true; // permissive for new categories
  return meta.allowedEventTypes.includes(eventType as EventTypeKey);
}
