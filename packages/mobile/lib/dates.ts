/** Format a Date as YYYY-MM-DD from LOCAL calendar components.
 *
 * NEVER use `date.toISOString().slice(0, 10)` for a calendar date the user
 * picked: it converts to UTC first, so in negative-UTC-offset zones (or near
 * midnight) it can slip the day backward by one. This reads the local
 * year/month/day directly, so the string always matches what the user saw.
 */
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
