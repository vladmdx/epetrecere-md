const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CALENDAR_MONTH = /^(\d{4})-(\d{2})$/;
const WALL_CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ParsedCalendarDate = Readonly<{
  year: number;
  month: number;
  day: number;
  ordinal: number;
}>;

export function parsedCalendarDate(value: unknown): ParsedCalendarDate | null {
  if (typeof value !== "string") return null;
  const match = CALENDAR_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Keep generated ISO dates in the range supported consistently by JS and
  // PostgreSQL clients. This is much wider than the product booking horizon.
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return { year, month, day, ordinal: Date.UTC(year, month - 1, day) };
}

export function isValidCalendarDate(value: unknown): value is string {
  return parsedCalendarDate(value) !== null;
}

export function isValidCalendarMonth(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = CALENDAR_MONTH.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1900 && year <= 2200 && month >= 1 && month <= 12;
}

export function isValidCalendarTime(value: unknown): value is string {
  return typeof value === "string" && WALL_CLOCK.test(value);
}

/** Validate an IANA time-zone identifier through the runtime's ICU database. */
export function isValidIanaTimeZone(value: unknown): value is string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 64
    || value.trim() !== value
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}
