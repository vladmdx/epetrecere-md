"use client";

/**
 * The agreement, section by section, with the signature at its foot.
 *
 * The acceptance step used to offer five checkboxes and five links. Ticking
 * "I have read and accept the Partner Collaboration Agreement" without ever
 * seeing it is not much of a reading, and partners said as much: they could
 * not tell what they were signing.
 *
 * Rendering the whole text inline fixed that and created a second problem —
 * twenty-odd articles in one scroll box is a wall, and the "read" gate was a
 * single drag of the scrollbar to the bottom, which proves a scroll position
 * and nothing else. So the document is split at its headings and opened one
 * section at a time. Each section has to be opened before the signature is
 * enabled, which is a weaker claim than "you read it" but a much stronger one
 * than "you dragged a scrollbar".
 *
 * The signature is shown where it belongs: at the end of the document, under
 * the last article, with the date it was given — so what is on screen reads
 * as a signed contract rather than a form that happens to sit near one.
 */

import { useMemo, useState } from "react";
import {
  legalBlocksFor,
  legalTitle,
  type LegalBlock,
  type LegalDocument,
  type PartnerIdentity,
} from "@/lib/legal";

export interface ContractSignature {
  /** Typed name of the signer. */
  name: string;
  /** Drawn signature as a PNG data URL, when one was given. */
  image?: string | null;
  /** Defaults to now. Passed in when re-displaying a stored acceptance. */
  date?: Date;
}

interface Section {
  title: string | null;
  blocks: LegalBlock[];
}

/** Split at h2. Leading paragraphs before the first heading are the preamble. */
function toSections(blocks: LegalBlock[]): Section[] {
  const out: Section[] = [];
  let current: Section = { title: null, blocks: [] };
  for (const b of blocks) {
    if (b.type === "h2") {
      if (current.blocks.length || current.title) out.push(current);
      current = { title: b.text, blocks: [] };
    } else {
      current.blocks.push(b);
    }
  }
  if (current.blocks.length || current.title) out.push(current);
  return out;
}

export function ContractReader({
  doc,
  locale,
  partner,
  onReachedEnd,
  signature,
  showVersion = true,
}: {
  doc: LegalDocument;
  locale: string;
  partner?: PartnerIdentity | null;
  /** Fires once every section has been opened. */
  onReachedEnd?: () => void;
  /** When present, rendered at the foot of the document. */
  signature?: ContractSignature | null;
  /** Versions remain on signed evidence, but need not clutter onboarding. */
  showVersion?: boolean;
}) {
  const blocks = legalBlocksFor(doc, locale, partner);
  const sections = useMemo(() => toSections(blocks), [blocks]);

  // The preamble is open to begin with; everything else starts closed.
  const [open, setOpen] = useState<number[]>([0]);
  const [seen, setSeen] = useState<number[]>([0]);
  const [reported, setReported] = useState(false);
  const copy = locale === "ru"
    ? { preamble: "Преамбула", opened: "открыто", open: "открыть", sections: "разделов открыто", of: "из", signedBy: "Подписано", signature: "Подпись", expand: "Открыть все разделы", collapse: "Свернуть разделы" }
    : locale === "en"
      ? { preamble: "Preamble", opened: "opened", open: "open", sections: "sections opened", of: "of", signedBy: "Signed by", signature: "Signature of", expand: "Open all sections", collapse: "Collapse sections" }
      : { preamble: "Preambul", opened: "deschis", open: "deschide", sections: "secțiuni deschise", of: "din", signedBy: "Semnat de", signature: "Semnătura lui", expand: "Deschide toate secțiunile", collapse: "Restrânge secțiunile" };

  function recordSeen(next: number[]) {
    setSeen(next);
    if (next.length >= sections.length && !reported) {
      setReported(true);
      onReachedEnd?.();
    }
  }

  function toggle(i: number) {
    setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));
    if (!seen.includes(i)) recordSeen([...seen, i]);
  }

  function toggleAll() {
    if (open.length === sections.length) {
      setOpen([]);
      return;
    }
    const all = sections.map((_, index) => index);
    setOpen(all);
    recordSeen(all);
  }

  const signedOn = signature?.date ?? new Date();

  return (
    <div className="rounded-xl border border-border bg-background/60">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="font-heading text-base font-bold">
          {legalTitle(doc, locale)}{" "}
          {showVersion && <span className="text-xs font-normal text-muted-foreground">
            v{doc.version}
          </span>}
        </h3>
        <p className="text-xs text-muted-foreground">
          {seen.length} {copy.of} {sections.length} {copy.sections}
        </p>
      </div>

      <div
        className="h-1 bg-border"
        role="progressbar"
        aria-valuenow={seen.length}
        aria-valuemin={0}
        aria-valuemax={sections.length}
        aria-label={copy.sections}
      >
        <div
          className="h-full bg-gold transition-all"
          style={{ width: `${sections.length ? (seen.length / sections.length) * 100 : 0}%` }}
        />
      </div>

      <div className="border-b border-border px-4 py-2">
        <button type="button" onClick={toggleAll} className="text-xs font-medium text-gold hover:underline">
          {open.length === sections.length ? copy.collapse : copy.expand}
        </button>
      </div>

      <div className="divide-y divide-border">
        {sections.map((s, i) => {
          const isOpen = open.includes(i);
          const label = s.title ?? copy.preamble;
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40"
              >
                <span className="font-medium">{label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {seen.includes(i) ? copy.opened : copy.open}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed">
                  {s.blocks.map((b, j) => (
                    <p key={j} className="text-muted-foreground">
                      {b.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {signature && (
        <div className="border-t border-border px-4 py-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            {copy.signedBy}
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-heading text-base font-bold">
                {signature.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {signedOn.toLocaleDateString(locale === "ru" ? "ru-RU" : locale === "en" ? "en-GB" : "ro-RO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            {signature.image && (
              <img
                src={signature.image}
                alt={`${copy.signature} ${signature.name}`}
                className="h-16 rounded-md bg-white p-1"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
