export type DailyClockRange = Readonly<{ start: string; end: string }>;
export type DailyMinuteWindow = Readonly<{ start: number; end: number }>;

const MINUTES_PER_DAY = 24 * 60;

export function parseClockMinute(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function clockRangeWindow(range: DailyClockRange): DailyMinuteWindow | null {
  const start = parseClockMinute(range.start);
  const rawEnd = parseClockMinute(range.end);
  if (start === null || rawEnd === null) return null;
  // An end at/before the start belongs to the following day. Keeping the
  // anchored end lets duration controls offer 23:00–02:00 while hour pickers
  // still enumerate only the selected day's 0..23 starts.
  const end = rawEnd <= start ? rawEnd + MINUTES_PER_DAY : rawEnd;
  return end > start ? { start, end } : null;
}

/** Resolve the canonical selected-day windows. `workingRanges`, when present,
 * is authoritative and may contain both a previous night's spill and today's
 * evening shift. The legacy singular value remains supported. */
export function resolveDailyWorkingWindows(input: {
  workingHours?: DailyClockRange | null;
  workingRanges?: readonly DailyClockRange[];
}): DailyMinuteWindow[] {
  if (input.workingRanges !== undefined) {
    return input.workingRanges
      .map(clockRangeWindow)
      .filter((window): window is DailyMinuteWindow => window !== null)
      .sort((left, right) => left.start - right.start || left.end - right.end);
  }
  if (input.workingHours === null) return [];
  if (input.workingHours) {
    const window = clockRangeWindow(input.workingHours);
    return window ? [window] : [];
  }
  return [{ start: 0, end: MINUTES_PER_DAY }];
}

export function minuteIsInDailyWindows(
  minute: number,
  windows: readonly DailyMinuteWindow[],
): boolean {
  return windows.some((window) => minute >= window.start && minute < window.end);
}

export function listBookableStartHours(
  windows: readonly DailyMinuteWindow[],
): number[] {
  const hours: number[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const start = hour * 60;
    if (windows.some((window) => start >= window.start && start + 60 <= window.end)) {
      hours.push(hour);
    }
  }
  return hours;
}

export function maximumDurationHours(
  startTime: string,
  windows: readonly DailyMinuteWindow[],
  cap = 8,
): number {
  const start = parseClockMinute(startTime);
  if (start === null) return 0;
  const containing = windows.find(
    (window) => start >= window.start && start < window.end,
  );
  if (!containing) return 0;
  return Math.max(0, Math.min(cap, Math.floor((containing.end - start) / 60)));
}

/** Canonical DB/API wall-clock serialization. Midnight and later totals wrap
 * modulo the day, so neither 24:00 nor 25:00 can escape to strict validators. */
export function endTimeAfterHours(startTime: string, durationHours: number): string | null {
  const start = parseClockMinute(startTime);
  if (start === null || !Number.isInteger(durationHours) || durationHours <= 0) {
    return null;
  }
  const end = (start + durationHours * 60) % MINUTES_PER_DAY;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(
    end % 60,
  ).padStart(2, "0")}`;
}
