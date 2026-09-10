import {
  ALL_EVENT_TYPES,
  type EventTypeKey,
} from "@/lib/events/normalize";

const EVENT_TYPE_SET = new Set<string>(ALL_EVENT_TYPES);

/**
 * Converts an untrusted database/API value to the canonical, display-ordered
 * event list. A missing legacy value means "all events" so existing partners
 * do not disappear from discovery after the column is introduced.
 */
export function normalizeArtistEventTypes(
  value: unknown,
  fallbackToAll = true,
): EventTypeKey[] {
  if (!Array.isArray(value)) {
    return fallbackToAll ? [...ALL_EVENT_TYPES] : [];
  }

  const selected = new Set(
    value.filter(
      (item): item is EventTypeKey =>
        typeof item === "string" && EVENT_TYPE_SET.has(item),
    ),
  );

  return ALL_EVENT_TYPES.filter((eventType) => selected.has(eventType));
}
