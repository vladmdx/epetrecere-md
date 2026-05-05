/**
 * Universal slugify that handles Romanian diacritics AND Cyrillic characters.
 *
 * Romanian diacritics are mapped first (ă→a, î→i, ș→s, ț→t, â→a),
 * then Cyrillic is transliterated, then Unicode accents are stripped,
 * and finally non-alphanumeric chars are replaced with hyphens.
 */

// Romanian diacritics → ASCII
const roMap: Record<string, string> = {
  ă: "a",
  â: "a",
  î: "i",
  ș: "s",
  ş: "s", // cedilla variant
  ț: "t",
  ţ: "t", // cedilla variant
};

// Cyrillic → Latin (for Russian/Ukrainian names)
const cyMap: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      // Map Romanian diacritics first
      .split("")
      .map((c) => roMap[c] || cyMap[c] || c)
      .join("")
      // Strip remaining Unicode accents via NFD decomposition
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Replace non-alphanumeric with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // Trim leading/trailing hyphens
      .replace(/^-|-$/g, "")
      .substring(0, 80)
  );
}

/**
 * Pick a unique slug by adding `-2`, `-3`, \u2026 suffixes until the candidate
 * isn't taken. Pass an `isTaken` checker that returns true if a given slug
 * already exists in the target table \u2014 keeps this helper DB-agnostic.
 *
 * We deliberately do NOT append a timestamp: the goal is a clean public URL
 * (`/sali/grand-palace`, not `/sali/grand-palace-mooz6vvx`). Conflict numbers
 * stay readable.
 */
export async function pickUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const baseSlug = slugify(base) || "venue";
  let candidate = baseSlug;
  for (let n = 2; await isTaken(candidate); n++) {
    candidate = `${baseSlug}-${n}`;
    if (n > 999) {
      // Pathological case \u2014 fall back to a random suffix so insertion
      // never deadlocks.
      candidate = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
      break;
    }
  }
  return candidate;
}
