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
  | "baptism"
  | "cumatrie"
  | "corporate"
  | "birthday"
  | "concert"
  | "other";

export const ALL_EVENT_TYPES: EventTypeKey[] = [
  "wedding",
  "baptism",
  "cumatrie",
  "corporate",
  "birthday",
  "concert",
  "other",
];

interface CategoryMeta {
  /** Emoji shown on the wizard tile. Falls back to 🎤 for unknowns. */
  emoji: string;
  /** Event types where this category makes sense to recommend. */
  allowedEventTypes: EventTypeKey[];
}

// ADULT = no minors, broader entertainment options OK.
const ADULT = ["wedding", "corporate", "birthday", "other"] as const;
// VENUE_NEUTRAL = anything except concerts (which have specific staging needs)
const VENUE_NEUTRAL = ["wedding", "baptism", "cumatrie", "corporate", "birthday", "other"] as const;

export const CATEGORY_META: Record<string, CategoryMeta> = {
  // ── Music ─────────────────────────────────────────
  moderatori: { emoji: "🎤", allowedEventTypes: [...VENUE_NEUTRAL, "concert"] },
  dj: { emoji: "🎧", allowedEventTypes: ["wedding", "corporate", "birthday", "other"] },
  cantareti: {
    emoji: "🎙️",
    // Excluded from baptism — religious ceremony, no secular performers.
    allowedEventTypes: ["wedding", "cumatrie", "corporate", "birthday", "concert", "other"],
  },
  "cantareti-de-estrada": { emoji: "🎤", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "interpreti-muzica-populara": { emoji: "🪗", allowedEventTypes: [...VENUE_NEUTRAL, "concert"] },
  formatii: { emoji: "🎸", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "cover-band": { emoji: "🎼", allowedEventTypes: [...ALL_EVENT_TYPES] },
  instrumentalisti: { emoji: "🎻", allowedEventTypes: [...ALL_EVENT_TYPES] },
  cvartet: { emoji: "🎻", allowedEventTypes: [...VENUE_NEUTRAL, "concert"] },

  // ── Dance ─────────────────────────────────────────
  dansatori: { emoji: "💃", allowedEventTypes: [...ADULT, "baptism", "cumatrie"] },
  "dansuri-populare": { emoji: "🩰", allowedEventTypes: [...VENUE_NEUTRAL] },
  "ansamblu-tiganesc": { emoji: "🎺", allowedEventTypes: [...VENUE_NEUTRAL] },
  "dans-oriental": { emoji: "🪩", allowedEventTypes: [...ADULT] },
  striptiz: { emoji: "🔥", allowedEventTypes: ["birthday", "other"] }, // private parties only

  // ── Show ──────────────────────────────────────────
  "show-program": { emoji: "🎭", allowedEventTypes: [...VENUE_NEUTRAL] },
  "iluzionisti-magicieni": { emoji: "🎩", allowedEventTypes: [...VENUE_NEUTRAL] },
  animatori: { emoji: "🎈", allowedEventTypes: ["baptism", "cumatrie", "birthday", "other"] }, // kids
  "show-ul-focului": { emoji: "🔥", allowedEventTypes: ["wedding", "corporate", "birthday", "other"] },
  clovni: { emoji: "🤡", allowedEventTypes: ["birthday", "other"] }, // kids birthdays only
  "interesant-la-sarbatoare": { emoji: "✨", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "show-circus": { emoji: "🎪", allowedEventTypes: [...VENUE_NEUTRAL] },
  "stand-up": { emoji: "🎙️", allowedEventTypes: ["corporate", "birthday", "other"] },
  "mos-craciun": { emoji: "🎅", allowedEventTypes: ["corporate", "birthday", "other"] }, // winter only

  // ── Services (foto/video/decor/tech) ──────────────
  fotografi: { emoji: "📸", allowedEventTypes: [...ALL_EVENT_TYPES] },
  videografi: { emoji: "🎥", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "foto-video": { emoji: "🎬", allowedEventTypes: [...ALL_EVENT_TYPES] },
  "foto-zona-selfie": { emoji: "🤳", allowedEventTypes: [...VENUE_NEUTRAL] },
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
