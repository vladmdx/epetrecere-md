import {
  DEFAULT_VENUE_TZ,
  addLocalDays,
  localDateInZone,
  startOfLocalDayUtc,
} from "@/lib/booking/zoned-interval";
import {
  isValidCalendarDate,
  isValidIanaTimeZone,
} from "@/lib/booking/calendar-input-validation";

const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const DEFAULT_MAX_PAGES = 100;
const DEFAULT_SYNC_WINDOW_DAYS = 91;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GoogleEvent {
  id: string;
  summary: string;
  start: string; // YYYY-MM-DD (normalized to date)
  end: string; // YYYY-MM-DD (exclusive end, per iCal convention)
  status: "confirmed" | "tentative" | "cancelled";
}

export class GoogleCalendarFetchError extends Error {
  readonly code = "GOOGLE_CALENDAR_FETCH_FAILED";

  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "GoogleCalendarFetchError";
  }
}

type GoogleEventsPage = {
  items?: Array<{
    id?: string;
    summary?: string;
    status?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
  }>;
  nextPageToken?: unknown;
};

export type FetchUpcomingEventsOptions = {
  fetchImpl?: typeof fetch;
  now?: Date;
  /**
   * The exact day window used by the local projection. Passing the same value
   * to every contributor prevents a partial final day or UTC/local-date drift.
   */
  window?: GoogleCalendarSyncWindow;
  /** Defensive ceiling; Google normally needs only a handful of pages. */
  maxPages?: number;
};

export type GoogleCalendarSyncWindow = Readonly<{
  dates: readonly string[];
  timeMin: Date;
  timeMax: Date;
  timeZone: string;
}>;

/**
 * Build 91 complete platform-local calendar days: today through day +90,
 * inclusive. Provider `timeMax` is the start of the following local day and
 * therefore remains exclusive even across DST changes.
 */
export function createGoogleCalendarSyncWindow(
  now: Date = new Date(),
  timeZone = DEFAULT_VENUE_TZ,
): GoogleCalendarSyncWindow {
  if (!Number.isFinite(now.getTime())) {
    throw new GoogleCalendarFetchError("Invalid Google Calendar sync instant.");
  }
  if (!isValidIanaTimeZone(timeZone)) {
    throw new GoogleCalendarFetchError("Invalid Google Calendar sync timezone.");
  }
  const firstDate = localDateInZone(now, timeZone);
  const dates = Array.from(
    { length: DEFAULT_SYNC_WINDOW_DAYS },
    (_, index) => addLocalDays(firstDate, index),
  );
  return Object.freeze({
    dates: Object.freeze(dates),
    timeMin: startOfLocalDayUtc(firstDate, timeZone),
    timeMax: startOfLocalDayUtc(
      addLocalDays(firstDate, DEFAULT_SYNC_WINDOW_DAYS),
      timeZone,
    ),
    timeZone,
  });
}

function validatedSyncWindow(
  value: GoogleCalendarSyncWindow,
): GoogleCalendarSyncWindow {
  if (
    !isValidIanaTimeZone(value.timeZone)
    || !Array.isArray(value.dates)
    || value.dates.length < 1
    || value.dates.length > 366
    || value.dates.some((date) => !isValidCalendarDate(date))
    || !(value.timeMin instanceof Date)
    || !(value.timeMax instanceof Date)
    || !Number.isFinite(value.timeMin.getTime())
    || !Number.isFinite(value.timeMax.getTime())
  ) {
    throw new GoogleCalendarFetchError("Invalid Google Calendar sync window.");
  }
  const firstDate = value.dates[0];
  if (
    value.dates.some((date, index) => date !== addLocalDays(firstDate!, index))
  ) {
    throw new GoogleCalendarFetchError("Invalid Google Calendar sync dates.");
  }
  const expectedMin = startOfLocalDayUtc(firstDate!, value.timeZone);
  const expectedMax = startOfLocalDayUtc(
    addLocalDays(firstDate!, value.dates.length),
    value.timeZone,
  );
  if (
    value.timeMin.getTime() !== expectedMin.getTime()
    || value.timeMax.getTime() !== expectedMax.getTime()
  ) {
    throw new GoogleCalendarFetchError(
      "Google Calendar provider bounds do not match the projection dates.",
    );
  }
  return value;
}

/** Google returns start/end as either `date` (all-day) or `dateTime`
 *  (timed). We normalize to YYYY-MM-DD for our day-based calendar. */
function normalizeToDate(part: { date?: string; dateTime?: string }): string | null {
  if (part.date) return part.date;
  if (part.dateTime) return part.dateTime.slice(0, 10);
  return null;
}

function addUtcDay(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const instant = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(instant).toISOString().slice(0, 10);
  if (roundTrip !== date) return null;
  return new Date(instant + DAY_MS).toISOString().slice(0, 10);
}

/**
 * `expandDays` consumes an exclusive end date. Google all-day events already
 * use that convention; timed events do not. A timed event ending after local
 * midnight occupies its end-date too, so advance the exclusive boundary by a
 * day. Exactly-midnight endings remain exclusive to the preceding date.
 */
function normalizedExclusiveEnd(part: {
  date?: string;
  dateTime?: string;
}): string | null {
  if (part.date) return part.date;
  if (!part.dateTime) return null;
  const date = part.dateTime.slice(0, 10);
  const clock = /T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/.exec(
    part.dateTime,
  );
  if (!clock) return null;
  const exactMidnight =
    clock[1] === "00"
    && clock[2] === "00"
    && (clock[3] ?? "00") === "00"
    && !/[1-9]/.test(clock[4] ?? "");
  return exactMidnight ? date : addUtcDay(date);
}

function normalizedStatus(value: string | undefined): GoogleEvent["status"] {
  return value === "tentative" ? "tentative" : "confirmed";
}

/**
 * Fetch every Google events page in the exact complete-day projection window.
 * Any provider, JSON, or pagination failure rejects the whole pull so callers
 * preserve the previous local projection instead of interpreting a failed
 * request as an empty feed.
 */
export async function fetchUpcomingEvents(
  accessToken: string,
  options: FetchUpcomingEventsOptions = {},
): Promise<GoogleEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const syncWindow = validatedSyncWindow(
    options.window
      ?? createGoogleCalendarSyncWindow(
        options.now ? new Date(options.now) : new Date(),
      ),
  );
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
    throw new GoogleCalendarFetchError("Invalid Google Calendar page limit.");
  }

  const baseParams = new URLSearchParams({
    timeMin: syncWindow.timeMin.toISOString(),
    timeMax: syncWindow.timeMax.toISOString(),
    timeZone: syncWindow.timeZone,
    singleEvents: "true", // expand recurring
    orderBy: "startTime",
    maxResults: "500",
  });

  const events = new Map<string, GoogleEvent>();
  const requestedPageTokens = new Set<string>();
  let pageToken: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams(baseParams);
    if (pageToken) {
      if (requestedPageTokens.has(pageToken)) {
        throw new GoogleCalendarFetchError(
          "Google Calendar returned a repeated page token.",
        );
      }
      requestedPageTokens.add(pageToken);
      params.set("pageToken", pageToken);
    }

    let response: Response;
    try {
      response = await fetchImpl(`${GOOGLE_EVENTS_URL}?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new GoogleCalendarFetchError("Google Calendar request failed.");
    }

    if (!response.ok) {
      throw new GoogleCalendarFetchError(
        `Google Calendar returned HTTP ${response.status}.`,
        response.status,
      );
    }

    let data: GoogleEventsPage;
    try {
      data = (await response.json()) as GoogleEventsPage;
    } catch {
      throw new GoogleCalendarFetchError(
        "Google Calendar returned an invalid JSON response.",
        response.status,
      );
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new GoogleCalendarFetchError(
        "Google Calendar returned an invalid response shape.",
        response.status,
      );
    }
    if (data.items !== undefined && !Array.isArray(data.items)) {
      throw new GoogleCalendarFetchError(
        "Google Calendar returned an invalid events collection.",
        response.status,
      );
    }

    for (const item of Array.isArray(data.items) ? data.items : []) {
      if (!item?.id || !item.start || !item.end) continue;
      if (item.status === "cancelled") continue;

      const start = normalizeToDate(item.start);
      const end = normalizedExclusiveEnd(item.end);
      if (!start || !end) continue;

      // Skip timed events shorter than an hour — they're usually a call, not a booking.
      if (item.start.dateTime && item.end.dateTime) {
        const duration =
          new Date(item.end.dateTime).getTime() -
          new Date(item.start.dateTime).getTime();
        if (!Number.isFinite(duration) || duration < 60 * 60 * 1000) continue;
      }

      events.set(item.id, {
        id: item.id,
        summary: item.summary ?? "Eveniment Google",
        start,
        end,
        status: normalizedStatus(item.status),
      });
    }

    if (data.nextPageToken == null || data.nextPageToken === "") {
      return [...events.values()];
    }
    if (typeof data.nextPageToken !== "string") {
      throw new GoogleCalendarFetchError(
        "Google Calendar returned an invalid page token.",
        response.status,
      );
    }
    if (
      data.nextPageToken.trim().length === 0
      || data.nextPageToken.length > 8_192
      || /[\u0000-\u001F\u007F]/.test(data.nextPageToken)
    ) {
      throw new GoogleCalendarFetchError(
        "Google Calendar returned an unsafe page token.",
        response.status,
      );
    }
    pageToken = data.nextPageToken;
  }

  throw new GoogleCalendarFetchError(
    `Google Calendar pagination exceeded ${maxPages} pages.`,
  );
}

/** Expand [start, end) to the list of day strings it covers. iCal/Google
 *  use exclusive ends for all-day events, so we stop BEFORE `end`. */
export function expandDays(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (cur < last) {
    out.push(
      `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`,
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  // Safeguard for single-day events that set end === start (some clients do this)
  if (out.length === 0) out.push(start);
  return out;
}
