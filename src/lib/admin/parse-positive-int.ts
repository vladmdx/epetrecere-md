/** Strict positive safe integers: reject NaN, fractions, zero, negatives, leading zeros. */
export function parsePositiveInt(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function parsePositiveIntId(raw: string | null | undefined): number | null {
  return parsePositiveInt(raw);
}
