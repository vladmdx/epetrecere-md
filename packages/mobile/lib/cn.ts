// Tiny className composer for NativeWind — equivalent of the web's cn().
// We don't import the web's `clsx` / `tailwind-merge` because:
//   1. clsx is overkill for our needs (we don't have complex conditional
//      object shorthand).
//   2. tailwind-merge doesn't ship a React Native variant — it would
//      try to dedupe DOM-only class collisions and lie about results.
//
// This helper just trims, joins, and skips falsy entries. If a future
// refactor needs deduping, swap in `twrnc` or roll a NativeWind-aware
// resolver here.

type ClassValue = string | number | null | undefined | false | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v && v !== 0) continue;
    if (Array.isArray(v)) {
      const nested = cn(...v);
      if (nested) out.push(nested);
    } else {
      out.push(String(v));
    }
  }
  return out.join(" ");
}
