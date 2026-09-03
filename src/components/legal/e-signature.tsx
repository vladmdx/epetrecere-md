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
import Link from "@/components/shared/locale-link";
import { Check, ChevronDown, FileText, ShieldCheck } from "lucide-react";
import { SignaturePad, type SignatureValue } from "./signature-pad";
import { useLocale } from "@/hooks/use-locale";
import {
  LEGAL_DOCUMENTS,
  PARTNER_REQUIRED_DOCS,
  VENUE_REQUIRED_DOCS,
  legalTitle,
  type PartnerIdentity,
  type PartnerType,
} from "@/lib/legal";
import { ContractReader } from "./contract-reader";

export interface ESignatureValue {
  signatureName: string;
  /** Handwritten signature (PNG data URL). */
  signatureImage: string | null;
  accepted: boolean;
  documents: string[];
  /** The party details that go into the contract as Annex 5. Stored on the
   *  acceptance row, which is append-only, so the signed document stays
   *  reproducible exactly as it was shown. */
  identity: PartnerIdentity;
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
  const [signatureKey, setSignatureKey] = useState(0);
  const [signature, setSignature] = useState<SignatureValue>({
    dataUrl: null,
    isValid: false,
  });
  // §5 asks for different details depending on what the partner is, so the
  // form follows the contract rather than inventing its own fields.
  const [partnerType, setPartnerType] = useState<PartnerType>("individual");
  const [legalName, setLegalName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [contractOpen, setContractOpen] = useState(false);
  const [contractRead, setContractRead] = useState(false);

  const isEntity = partnerType !== "individual";
  const identity: PartnerIdentity = {
    partnerType,
    legalName: legalName.trim(),
    idNumber: idNumber.trim() || null,
    legalAddress: legalAddress.trim() || null,
    representativeName: isEntity ? representativeName.trim() || null : null,
  };
  /** Enough to render the contract's Annex 5 with something meaningful in it. */
  const identityOk =
    legalName.trim().length >= 3 &&
    idNumber.trim().length >= 4 &&
    legalAddress.trim().length >= 5 &&
    (!isEntity || representativeName.trim().length >= 3);

  /** The agreement itself — the one document that gets read in full. */
  const mainDoc = docs[0];

  const allTicked = docs.length > 0 && docs.every((d) => ticked.has(d.slug));
  const matchesSigner = (n: string, party: PartnerIdentity) => n.trim().normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase() === (party.partnerType === "individual" ? party.legalName : party.representativeName ?? "").trim().normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase();
  const nameOk = name.trim().length >= 3 && name.trim().includes(" ") && matchesSigner(name, identity);
  // All three are required: the tick is what the Partner Agreement §4.2 asks
  // for, the typed name identifies the signer, and the drawing is the
  // handwritten signature itself.
  const valid =
    allTicked && nameOk && signature.isValid && identityOk && contractRead;

  function emit(
    nextTicked: Set<string>,
    nextName: string,
    nextSig: SignatureValue = signature,
    nextRead: boolean = contractRead,
    nextIdentity: PartnerIdentity = identity,
  ) {
    if (JSON.stringify(nextIdentity) !== JSON.stringify(identity)) {
      // Changing the contracting party invalidates the earlier read/consent.
      setSignatureKey(k => k + 1);
      setContractRead(false);
      setSignature({ dataUrl: null, isValid: false });
      setTicked(new Set());
      nextRead = false;
      nextTicked = new Set();
      nextSig = { dataUrl: null, isValid: false };
    }
    const entity = nextIdentity.partnerType !== "individual";
    const idOk =
      (nextIdentity.legalName ?? "").trim().length >= 3 &&
      (nextIdentity.idNumber ?? "").trim().length >= 4 &&
      (nextIdentity.legalAddress ?? "").trim().length >= 5 &&
      (!entity || (nextIdentity.representativeName ?? "").trim().length >= 3);
    onChange?.({
      signatureName: nextName.trim(),
      signatureImage: nextSig.dataUrl,
      accepted:
        docs.every((d) => nextTicked.has(d.slug)) &&
        nextName.trim().length >= 3 &&
        nextName.trim().includes(" ") && matchesSigner(nextName, nextIdentity) &&
        nextSig.isValid &&
        idOk &&
        nextRead,
      documents: docs.map((d) => d.slug),
      identity: nextIdentity,
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
          <p className="mt-2 text-xs text-muted-foreground">
            {locale === "ru" ? "Электронное принятие условий с подписью на экране. Это не квалифицированная электронная подпись. Имя подписанта должно совпадать с ФИО стороны или её представителя." : locale === "en" ? "Electronic acceptance with an on-screen signature. This is not a qualified electronic signature. The signer must be the named party or its representative." : "Acceptare electronică cu semnătură desenată pe ecran. Nu este o semnătură electronică calificată. Semnatarul trebuie să fie persoana indicată în contract sau reprezentantul ei."}
          </p>
        </div>
      </div>

      {/* 1 — who is being bound. §5.2/§5.3/§5.4 ask for different things, so
             the fields follow the partner's own answer. */}
      <div className="mb-5 rounded-xl border border-border/50 bg-background/40 p-4">
        <p className="text-sm font-medium">{t("legal.identityTitle")}</p>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("legal.identityIntro")}
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {(
            [
              ["individual", "legal.partnerTypeIndividual"],
              ["sole_trader", "legal.partnerTypeSoleTrader"],
              ["company", "legal.partnerTypeCompany"],
            ] as const
          ).map(([value, key]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setPartnerType(value);
                emit(ticked, name, signature, contractRead, {
                  ...identity,
                  partnerType: value,
                });
              }}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                partnerType === value
                  ? "bg-gold/15 text-gold ring-1 ring-gold/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(key)}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <IdField
            label={t(
              isEntity ? "legal.legalNameEntity" : "legal.legalNameIndividual",
            )}
            value={legalName}
            onChange={(v) => {
              setLegalName(v);
              emit(ticked, name, signature, contractRead, {
                ...identity,
                legalName: v.trim(),
              });
            }}
          />
          <IdField
            label={t(
              isEntity ? "legal.idNumberEntity" : "legal.idNumberIndividual",
            )}
            value={idNumber}
            onChange={(v) => {
              setIdNumber(v);
              emit(ticked, name, signature, contractRead, {
                ...identity,
                idNumber: v.trim() || null,
              });
            }}
          />
          <IdField
            label={t(
              isEntity
                ? "legal.legalAddressEntity"
                : "legal.legalAddressIndividual",
            )}
            value={legalAddress}
            onChange={(v) => {
              setLegalAddress(v);
              emit(ticked, name, signature, contractRead, {
                ...identity,
                legalAddress: v.trim() || null,
              });
            }}
            className="sm:col-span-2"
          />
          {isEntity && (
            <IdField
              label={t("legal.representativeName")}
              value={representativeName}
              onChange={(v) => {
                setRepresentativeName(v);
                emit(ticked, name, signature, contractRead, {
                  ...identity,
                  representativeName: v.trim() || null,
                });
              }}
              className="sm:col-span-2"
            />
          )}
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

      {/* 2 — the agreement itself, with their details in it, before any
             signing happens. */}
      {mainDoc && (
        <div className="mt-4">
          <button
            type="button"
            disabled={!identityOk}
            onClick={() => setContractOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>
              {contractOpen ? t("legal.hideContract") : t("legal.readContract")}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${contractOpen ? "rotate-180" : ""}`}
            />
          </button>
          {!identityOk && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("legal.fillIdentityFirst")}
            </p>
          )}
          {contractOpen && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {t("legal.contractWithYourData")}
              </p>
              <ContractReader
                doc={mainDoc}
                locale={locale}
                partner={identity}
                onReachedEnd={() => {
                  setContractRead(true);
                  emit(ticked, name, signature, true);
                }}
                // Shown at the foot of the document as it is given, so the
                // page reads as a signed contract rather than a form sitting
                // next to one.
                signature={
                  name.trim()
                    ? { name: name.trim(), image: signature.dataUrl }
                    : null
                }
              />
            </div>
          )}
          {contractRead ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-green-500">
              <Check className="h-3.5 w-3.5" />
              {t("legal.contractRead")}
            </p>
          ) : (
            identityOk && (
              <p className="mt-2 text-xs text-amber-500">
                {t("legal.mustReadContract")}
              </p>
            )
          )}
        </div>
      )}

      {/* 3 — and only now, the signature. */}
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
        <SignaturePad key={signatureKey}
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

function IdField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-gold"
      />
    </div>
  );
}
