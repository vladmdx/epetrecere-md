"use client";

/**
 * The agreement, in full, with the partner's own details appended as Annex 5.
 *
 * The acceptance step used to offer five checkboxes and five links. Ticking
 * "I have read and accept the Partner Collaboration Agreement" without ever
 * seeing it is not much of a reading, and partners said as much: they could
 * not tell what they were signing. This renders the whole text inline —
 * thirty-one articles and five annexes — ending with the party details they
 * just entered, so the document on screen is the document being signed.
 *
 * Scrolling to the bottom is reported back, so the caller can require it
 * before enabling the signature rather than taking the tick on trust.
 */

import { useRef } from "react";
import { legalBlocksFor, legalTitle, type LegalDocument, type PartnerIdentity } from "@/lib/legal";

export function ContractReader({
  doc,
  locale,
  partner,
  onReachedEnd,
  height = 420,
}: {
  doc: LegalDocument;
  locale: string;
  partner?: PartnerIdentity | null;
  onReachedEnd?: () => void;
  height?: number;
}) {
  const reported = useRef(false);
  const blocks = legalBlocksFor(doc, locale, partner);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (reported.current) return;
    const el = e.currentTarget;
    // A 48px slack: hitting the exact pixel is fussy on trackpads and the
    // point is "you went through it", not "you landed precisely".
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      reported.current = true;
      onReachedEnd?.();
    }
  }

  return (
    <div
      onScroll={handleScroll}
      style={{ maxHeight: height }}
      className="overflow-y-auto rounded-xl border border-border bg-background/60 p-4 text-sm leading-relaxed"
    >
      <h3 className="mb-3 font-heading text-base font-bold">
        {legalTitle(doc, locale)}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          v{doc.version}
        </span>
      </h3>
      {blocks.map((b, i) =>
        b.type === "h2" ? (
          <h4
            key={i}
            className="mt-4 mb-1.5 font-semibold text-foreground first:mt-0"
          >
            {b.text}
          </h4>
        ) : (
          <p key={i} className="mb-2 whitespace-pre-wrap text-muted-foreground">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}
