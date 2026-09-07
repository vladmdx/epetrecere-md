/** Carry the planner's exact event interval into a venue booking request. */
export function venueRequestInterval(plan: {
  startTime?: string | null;
  durationHours?: number | null;
}): { startTime?: string; endTime?: string } {
  const startTime = plan.startTime;
  const minutes = (plan.durationHours ?? 0) * 60;
  if (!startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
    || !Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) {
    // Old plans can have no interval. Preserve the API's existing all-day
    // fallback rather than guessing a start time or duration for the client.
    return {};
  }
  const [hours, minute] = startTime.split(":").map(Number);
  const end = (hours * 60 + minute + minutes) % (24 * 60);
  return {
    startTime,
    endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
  };
}
