const CHISINAU_TIME_ZONE = "Europe/Chisinau";

/** Current Moldova calendar date, independent of the server's own timezone. */
export function currentChisinauDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHISINAU_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) {
    throw new Error("chisinau_date_format_failed");
  }
  return `${year}-${month}-${day}`;
}
