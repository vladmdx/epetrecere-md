import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The logo as a data URI, for the Open Graph cards.
 *
 * next/og renders with satori, which will not fetch a relative path and has no
 * access to the running site — an `<img src="/brand/logo.png">` simply comes
 * out blank. Reading the file off disk and inlining it is the one approach
 * that works in every environment, local and deployed alike.
 *
 * Read once per process rather than per request: these cards are generated
 * often when a listing is shared, and the file does not change between
 * deploys. If the file is ever missing, callers fall back to the wordmark in
 * text — a share card without a logo is a great deal better than a share card
 * that fails to render at all.
 */
let cached: string | null | undefined;

export function ogLogoDataUri(): string | null {
  if (cached !== undefined) return cached;
  try {
    const file = join(process.cwd(), "public", "brand", "logo.png");
    cached = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  } catch {
    cached = null;
  }
  return cached;
}

/** Square mark, for cards that want the tile rather than the full lockup. */
let cachedMark: string | null | undefined;

export function ogMarkDataUri(): string | null {
  if (cachedMark !== undefined) return cachedMark;
  try {
    const file = join(process.cwd(), "public", "brand", "icon-192.png");
    cachedMark = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  } catch {
    cachedMark = null;
  }
  return cachedMark;
}
