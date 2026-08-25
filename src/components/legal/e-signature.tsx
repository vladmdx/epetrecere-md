"use client";

/**
 * Electronic signature block for vendor registration.
 *
 * The vendor ticks each required document and types their full name — that
 * typed name IS the signature (Partner Agreement §4 "acceptarea electronică").
 * On submit the server records the technical fixation required by Venue
 * Agreement Anexa 2 (version, timestamp, IP, user-agent, content hash).
 *
 * Deliberately blocks submission until every document is ticked and the name
 * looks real: an un-ticked box would make the acceptance unprovable.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, FileText, ShieldCheck } from "lucide-react";
import { SignaturePad, type SignatureValue } from "./signature-pad";
import { useLocale } from "@/hooks/use-locale";
import {
  LEGAL_DOCUMENTS,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
  legalTitle,
} from "@/lib/legal";

export interface ESignatureValue {
  signatureName: string;
  /** Handwritten signature (PNG data URL). */
  signatureImage: string | null;
  accepted: boolean;
  documents: string[];
}

export function ESignature({
  subjectType,
  onChange,
  defaultName = "",
}: {
  subjectType: "artist" | "venue";
  onChange?: (v: ESignatureValue) => void;
  defaultName?: string;
}) {
  const { t, locale } = useLocale();
  const required = subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;

  const docs = useMemo(
    () =>
      required
        .map((slug) => LEGAL_DOCUMENTS.find((d) => d.slug === slug))
        .filter((d): d is (typeof LEGAL_DOCUMENTS)[number] => Boolean(d)),
    [required],
  );

  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState(defaultName);
  const [signature, setSignature] = useState<SignatureValue>({
    dataUrl: null,
    isValid: false,
  });

  const allTicked = docs.length > 0 && docs.every((d) => ticked.has(d.slug));
  const nameOk = name.trim().length >= 3 && name.trim().includes(" ");
  // All three are required: the tick is what the Partner Agreement §4.2 asks
  // for, the typed name identifies the signer, and the drawing is the
  // handwritten signature itself.
  const valid = allTicked && nameOk && signature.isValid;

  function emit(
    nextTicked: Set<string>,
    nextName: string,
    nextSig: SignatureValue = signature,
  ) {
    onChange?.({
      signatureName: nextName.trim(),
      signatureImage: nextSig.dataUrl,
      accepted:
        docs.every((d) => nextTicked.has(d.slug)) &&
        nextName.trim().length >= 3 &&
        nextName.trim().includes(" ") &&
        nextSig.isValid,
      documents: docs.map((d) => d.slug),
    });
  }

  function toggle(slug: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      emit(next, name);
      return next;
    });
  }

  function toggleAll() {
    setTicked((prev) => {
      const next =
        prev.size === docs.length ? new Set<string>() : new Set(docs.map((d) => d.slug));
      emit(next, name);
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-gold/25 bg-gold/[0.04] p-5">
      <div className="mb-4 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
        <div>
          <p className="font-semibold">
            {t("legal.signTitle")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("legal.signIntro")}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={toggleAll}
        className="mb-3 text-xs font-medium text-gold hover:underline"
      >
        {ticked.size === docs.length
          ? t("legal.untickAll")
          : t("legal.tickAll")}
      </button>

      <ul className="space-y-2">
        {docs.map((d) => {
          const on = ticked.has(d.slug);
          return (
            <li key={d.slug}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-3 transition-colors hover:border-gold/40">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    on ? "border-gold bg-gold text-[#0D0D0D]" : "border-border"
                  }`}
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => toggle(d.slug)}
                />
                <span className="flex-1 text-sm">
                  <span className="text-muted-foreground">
                    {t("legal.iAccept")}{" "}
                  </span>
                  <Link
                    href={`/legal/${d.slug}`}
                    target="_blank"
                    className="font-medium text-gold hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {legalTitle(d, locale)}
                  </Link>
                  <span className="ml-1 text-xs text-muted-foreground">v{d.version}</span>
                </span>
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("legal.fullName")}
        </label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            emit(ticked, e.target.value);
          }}
          placeholder="Ion Popescu"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-gold"
        />
        {!nameOk && name.length > 0 && (
          <p className="mt-1 text-xs text-amber-500">
            {t("legal.nameHint")}
          </p>
        )}
      </div>

      <div className="mt-4">
        <SignaturePad
          onChange={(v) => {
            setSignature(v);
            emit(ticked, name, v);
          }}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {t("legal.fixationNote")}
      </p>

      {valid && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green-500">
          <Check className="h-3.5 w-3.5" />
          {t("legal.readyToSign")}
        </p>
      )}
    </div>
  );
}
