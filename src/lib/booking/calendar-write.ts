import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import {
  acquireCalendarEntityDayLocks,
  type CalendarLockEntity,
} from "./advisory-locks";
import {
  isValidCalendarDate,
  parsedCalendarDate,
} from "./calendar-input-validation";

export {
  isValidCalendarDate,
  isValidCalendarMonth,
} from "./calendar-input-validation";

const DAY_MS = 24 * 60 * 60 * 1000;
const MANAGED_SOURCES = ["manual", "google_sync"] as const;
const WRITABLE_STATUSES = ["booked", "tentative", "blocked"] as const;

export type ManagedCalendarSource = (typeof MANAGED_SOURCES)[number];
export type ManagedCalendarStatus = (typeof WRITABLE_STATUSES)[number];
export type CalendarEntity = CalendarLockEntity;

export type ManagedCalendarRow = CalendarEntity & {
  date: string;
  status: ManagedCalendarStatus;
  source: ManagedCalendarSource;
  note?: string | null;
  eventType?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  /** Managed rows are whole-entity rows; hall-scoped writes have their own API. */
  hallId?: null;
};

export type ManagedCalendarReplacementInput = {
  entities: readonly CalendarEntity[];
  dates: readonly string[];
  source: ManagedCalendarSource;
  rows: readonly ManagedCalendarRow[];
  /** Google sync also cleans historical hall-scoped rows from this source. */
  deleteScope?: "unscoped" | "all";
};

export type CalendarWriteTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type ManagedCalendarReplacementOptions = {
  /** Legal/user scope locks must be acquired before calendar entity locks. */
  beforeLocks?: (tx: CalendarWriteTransaction) => Promise<void>;
  /** Re-check the locked owner/membership chain immediately before DELETE. */
  authorizeAfterLocks?: (tx: CalendarWriteTransaction) => Promise<void>;
};

export class CalendarWriteValidationError extends Error {
  readonly code = "INVALID_CALENDAR_WRITE";

  constructor(message: string) {
    super(message);
    this.name = "CalendarWriteValidationError";
  }
}

export function normalizeCalendarDates(
  values: readonly unknown[],
  options: { maxDates?: number; rejectDuplicates?: boolean } = {},
): string[] {
  const maxDates = options.maxDates ?? 366;
  if (!Number.isInteger(maxDates) || maxDates < 1) {
    throw new CalendarWriteValidationError("Invalid calendar date limit.");
  }
  if (values.length === 0) {
    throw new CalendarWriteValidationError("At least one calendar date is required.");
  }
  if (values.length > maxDates) {
    throw new CalendarWriteValidationError(
      `Calendar write exceeds the ${maxDates}-day limit.`,
    );
  }

  const seen = new Set<string>();
  for (const value of values) {
    if (!isValidCalendarDate(value)) {
      throw new CalendarWriteValidationError(
        `Invalid calendar date: ${String(value)}`,
      );
    }
    if (seen.has(value) && options.rejectDuplicates !== false) {
      throw new CalendarWriteValidationError(
        `Duplicate calendar date: ${value}`,
      );
    }
    seen.add(value);
  }
  return [...seen].sort();
}

export function calendarDateRange(
  fromDate: unknown,
  toDate: unknown,
  options: { maxDates?: number } = {},
): string[] {
  if (!isValidCalendarDate(fromDate) || !isValidCalendarDate(toDate)) {
    throw new CalendarWriteValidationError(
      "Calendar range dates must use a real YYYY-MM-DD date.",
    );
  }
  const start = parsedCalendarDate(fromDate)!;
  const end = parsedCalendarDate(toDate)!;
  if (start.ordinal > end.ordinal) {
    throw new CalendarWriteValidationError(
      "Calendar range start must not be after its end.",
    );
  }
  const count = Math.floor((end.ordinal - start.ordinal) / DAY_MS) + 1;
  const maxDates = options.maxDates ?? 366;
  if (count > maxDates) {
    throw new CalendarWriteValidationError(
      `Calendar range exceeds the ${maxDates}-day limit.`,
    );
  }
  return Array.from({ length: count }, (_, index) =>
    new Date(start.ordinal + index * DAY_MS).toISOString().slice(0, 10),
  );
}

function normalizeEntities(entities: readonly CalendarEntity[]): CalendarEntity[] {
  if (entities.length === 0) {
    throw new CalendarWriteValidationError(
      "At least one calendar entity is required.",
    );
  }
  if (entities.length > 250) {
    throw new CalendarWriteValidationError(
      "Calendar write exceeds the 250-entity limit.",
    );
  }

  const unique = new Map<string, CalendarEntity>();
  for (const entity of entities) {
    if (
      !["artist", "venue"].includes(entity.entityType)
      || !Number.isSafeInteger(entity.entityId)
      || entity.entityId < 1
    ) {
      throw new CalendarWriteValidationError("Invalid calendar entity.");
    }
    unique.set(`${entity.entityType}:${entity.entityId}`, entity);
  }
  return [...unique.values()];
}

function prepareManagedCalendarReplacement(
  input: ManagedCalendarReplacementInput,
) {
  const entities = normalizeEntities(input.entities);
  const dates = normalizeCalendarDates(input.dates, {
    maxDates: 366,
    rejectDuplicates: true,
  });
  if (!MANAGED_SOURCES.includes(input.source)) {
    throw new CalendarWriteValidationError("Unsupported managed calendar source.");
  }
  if (input.rows.length > 25_000) {
    throw new CalendarWriteValidationError(
      "Calendar write exceeds the 25000-row limit.",
    );
  }

  const entityKeys = new Set(
    entities.map((entity) => `${entity.entityType}:${entity.entityId}`),
  );
  const dateKeys = new Set(dates);
  const rowKeys = new Set<string>();
  const rows = input.rows.map((row) => {
    const entityKey = `${row.entityType}:${row.entityId}`;
    const rowKey = `${entityKey}:${row.date}`;
    if (!entityKeys.has(entityKey)) {
      throw new CalendarWriteValidationError(
        "Replacement row targets an unlocked calendar entity.",
      );
    }
    if (!dateKeys.has(row.date) || !isValidCalendarDate(row.date)) {
      throw new CalendarWriteValidationError(
        "Replacement row targets an unlocked calendar date.",
      );
    }
    if (row.source !== input.source || !MANAGED_SOURCES.includes(row.source)) {
      throw new CalendarWriteValidationError(
        "Replacement row source does not match the managed source.",
      );
    }
    if (!WRITABLE_STATUSES.includes(row.status)) {
      throw new CalendarWriteValidationError(
        "Available calendar days must be represented by no managed row.",
      );
    }
    if (row.hallId != null) {
      throw new CalendarWriteValidationError(
        "Managed calendar rows must be whole-entity rows.",
      );
    }
    if (rowKeys.has(rowKey)) {
      throw new CalendarWriteValidationError(
        `Duplicate replacement row: ${row.entityType}:${row.entityId}:${row.date}`,
      );
    }
    rowKeys.add(rowKey);
    return {
      entityType: row.entityType,
      entityId: row.entityId,
      date: row.date,
      status: row.status,
      source: row.source,
      note: row.note ?? null,
      eventType: row.eventType ?? null,
      startTime: row.startTime ?? null,
      endTime: row.endTime ?? null,
      hallId: null,
    };
  });

  return { entities, dates, rows };
}

/**
 * Transactional primitive for callers that must serialize and re-authorize a
 * wider scope around the calendar replacement (notably Google sync). The
 * complete entity set is still locked before the complete day set. An
 * optional authorization callback runs only after those locks and before the
 * first DELETE, so a failed recheck leaves the previous projection intact.
 */
export async function replaceManagedCalendarEventsInTransaction(
  tx: CalendarWriteTransaction,
  input: ManagedCalendarReplacementInput,
  options: Pick<ManagedCalendarReplacementOptions, "authorizeAfterLocks"> = {},
): Promise<{ inserted: number }> {
  const { entities, dates, rows } = prepareManagedCalendarReplacement(input);

  await acquireCalendarEntityDayLocks(tx, entities, dates);
  await options.authorizeAfterLocks?.(tx);

  for (const entityType of ["venue", "artist"] as const) {
    const ids = entities
      .filter((entity) => entity.entityType === entityType)
      .map((entity) => entity.entityId)
      .sort((a, b) => a - b);
    if (ids.length === 0) continue;
    await tx.delete(calendarEvents).where(
      and(
        eq(calendarEvents.entityType, entityType),
        inArray(calendarEvents.entityId, ids),
        inArray(calendarEvents.date, dates),
        eq(calendarEvents.source, input.source),
        input.deleteScope === "all" ? undefined : isNull(calendarEvents.hallId),
      ),
    );
  }

  // Keep well below PostgreSQL's bind-parameter limit for large sync jobs.
  for (let offset = 0; offset < rows.length; offset += 500) {
    await tx.insert(calendarEvents).values(rows.slice(offset, offset + 500));
  }
  return { inserted: rows.length };
}

/**
 * Replace one managed source projection under the same locks used by booking
 * availability. Deletion and insertion happen in the same short transaction.
 */
export async function replaceManagedCalendarEvents(
  input: ManagedCalendarReplacementInput,
  options: ManagedCalendarReplacementOptions = {},
): Promise<{ inserted: number }> {
  // Fail malformed caller input before opening a database connection. The
  // transactional primitive validates again so direct in-transaction callers
  // receive the same boundary guarantees.
  prepareManagedCalendarReplacement(input);
  return db.transaction(async (tx) => {
    await options.beforeLocks?.(tx);
    return replaceManagedCalendarEventsInTransaction(tx, input, {
      authorizeAfterLocks: options.authorizeAfterLocks,
    });
  });
}
