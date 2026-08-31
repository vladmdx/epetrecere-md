/**
 * Date helpers that stay in the device's own timezone.
 *
 * This module was imported by app/(client)/plan/new.tsx but had never been
 * committed: it existed only in one working copy, so the tree in git — the
 * tree EAS builds from — could not resolve it. Nothing surfaced locally
 * because the file was sitting on disk next to the code that needed it.
 */

/**
 * A calendar date as the user sees it, `YYYY-MM-DD`, read in LOCAL time.
 *
 * `toISOString().slice(0, 10)` is the usual shortcut and it is wrong here: it
 * converts to UTC first, so for anyone east of Greenwich a date picked late in
 * the evening comes back as the next day, and one picked after midnight as the
 * previous one. Moldova is UTC+2/+3, so this is a real off-by-one-day, not a
 * theoretical one.
 *
 * CalendarPicker anchors its selections at local noon partly to keep that
 * shortcut from slipping elsewhere in the app; this function does not need the
 * anchor to be correct.
 */
export function toLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today, in the device's timezone, as `YYYY-MM-DD`. */
export function todayLocalYMD(): string {
  return toLocalYMD(new Date());
}
