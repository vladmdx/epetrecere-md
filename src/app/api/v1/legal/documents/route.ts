import { NextRequest, NextResponse } from "next/server";
import {
  getLegalDocument,
  legalBlocks,
  legalTitle,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
  LEGAL_PACK_VERSION,
} from "@/lib/legal";

/**
 * The text a partner is asked to sign, for the app.
 *
 * Deliberately returns `legalBlocks` — the exact blocks the accept handler
 * hashes into `content_hash`. Showing anything else would mean the app
 * displays one document and the evidence row attests to another, which is
 * precisely what the hash exists to rule out.
 *
 * Public: this is published law-facing text, the same words served on the
 * website, and requiring a session to read your own contract before signing
 * it would be the wrong way round.
 */
export async function GET(req: NextRequest) {
  const locale = ["ro", "ru", "en"].includes(
    req.nextUrl.searchParams.get("locale") ?? "",
  )
    ? req.nextUrl.searchParams.get("locale")!
    : "ro";
  const subjectType =
    req.nextUrl.searchParams.get("subject_type") === "venue"
      ? "venue"
      : "artist";

  const slugs =
    subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;

  const items = slugs
    .map((slug) => {
      const doc = getLegalDocument(slug);
      if (!doc) return null;
      return {
        slug: doc.slug,
        version: doc.version,
        title: legalTitle(doc, locale),
        blocks: legalBlocks(doc, locale),
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    items,
    packVersion: LEGAL_PACK_VERSION,
    locale,
    subjectType,
  });
}
