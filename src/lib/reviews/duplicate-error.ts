/** Drizzle wraps PostgreSQL errors in `.cause`; query text may itself contain
 * user-written words like "duplicate", so never classify from the message. */
export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 8; depth++) {
    if (!current || typeof current !== "object" || seen.has(current)) return false;
    seen.add(current);
    const value = current as { code?: unknown; cause?: unknown };
    if (value.code === "23505") return true;
    current = value.cause;
  }
  return false;
}
