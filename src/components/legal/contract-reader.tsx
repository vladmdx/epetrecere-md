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
}: {
  doc: LegalDocument;
  locale: string;
  partner?: PartnerIdentity | null;
  /** Fires once every section has been opened. */
  onReachedEnd?: () => void;
  /** When present, rendered at the foot of the document. */
  signature?: ContractSignature | null;
}) {
  const blocks = legalBlocksFor(doc, locale, partner);
  const sections = useMemo(() => toSections(blocks), [blocks]);

  // The preamble is open to begin with; everything else starts closed.
  const [open, setOpen] = useState<number[]>([0]);
  const [seen, setSeen] = useState<number[]>([0]);
  const [reported, setReported] = useState(false);

  function toggle(i: number) {
    setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));
    setSeen((s) => {
      if (s.includes(i)) return s;
      const next = [...s, i];
      if (next.length >= sections.length && !reported) {
        setReported(true);
        onReachedEnd?.();
      }
      return next;
    });
  }

  const signedOn = signature?.date ?? new Date();

  return (
    <div className="rounded-xl border border-border bg-background/60">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="font-heading text-base font-bold">
          {legalTitle(doc, locale)}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            v{doc.version}
          </span>
        </h3>
        <p className="text-xs text-muted-foreground">
          {seen.length} din {sections.length} secțiuni deschise
        </p>
      </div>

      <div
        className="h-1 bg-border"
        role="progressbar"
        aria-valuenow={seen.length}
        aria-valuemax={sections.length}
      >
        <div
          className="h-full bg-gold transition-all"
          style={{ width: `${(seen.length / sections.length) * 100}%` }}
        />
      </div>

      <div className="divide-y divide-border">
        {sections.map((s, i) => {
          const isOpen = open.includes(i);
          const label = s.title ?? "Preambul";
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
                  {seen.includes(i) ? "citit" : "deschide"}
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
            Semnat de
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-heading text-base font-bold">
                {signature.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {signedOn.toLocaleDateString("ro-RO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            {signature.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signature.image}
                alt={`Semnătura lui ${signature.name}`}
                className="h-16 rounded-md bg-white p-1"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
