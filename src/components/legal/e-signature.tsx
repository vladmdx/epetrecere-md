"use client";

/**
 * Electronic signature block for vendor registration.
 *
 * The vendor explicitly accepts the listed documents together, identifies
 * the contracting party and draws their signature.
 * On submit the server records the technical evidence of acceptance
 * (version, timestamp, IP, user-agent, content hash).
 *
 * Submission still requires complete identity details, an unchecked-by-default
 * acceptance and a matching drawn signature. The contract preview remains
 * available, but opening every section is not a submission requirement.
 */

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/shared/locale-link";
import { AlertCircle, Check, ChevronDown, FileText, ShieldCheck } from "lucide-react";
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
import {
  MOLDOVAN_ID_NUMBER_LENGTH,
  signerMatchesIdentity,
  validatePartnerIdentity,
  type PartnerIdentityField,
} from "@/lib/legal/identity-validation";
import { ContractReader } from "./contract-reader";

export type ESignatureIssue = PartnerIdentityField |
  "documentsAccepted" |
  "signatureName" |
  "signatureImage";

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
  /** Exact unmet requirements, used by the final submit button to reveal a
   * useful explanation instead of becoming inert. */
  validationIssues: ESignatureIssue[];
}

function signatureIssues({
  acceptedDocuments,
  identity,
  name,
  signature,
}: {
  acceptedDocuments: boolean;
  identity: PartnerIdentity;
  name: string;
  signature: SignatureValue;
}): ESignatureIssue[] {
  const identityFields = validatePartnerIdentity(identity).fields;
  const issues: ESignatureIssue[] = [];
  for (const field of [
    "legalName",
    "idNumber",
    "legalAddress",
    "representativeName",
  ] as const) {
    if (identityFields[field]) issues.push(field);
  }
  if (!acceptedDocuments) issues.push("documentsAccepted");
  if (!signerMatchesIdentity(name, identity)) issues.push("signatureName");
  if (!signature.isValid) issues.push("signatureImage");
  return issues;
}

export function ESignature({
  subjectType,
  onChange,
  defaultName = "",
  initialIdentity,
  showValidation = false,
}: {
  subjectType: "artist" | "venue";
  onChange?: (v: ESignatureValue) => void;
  defaultName?: string;
  initialIdentity?: PartnerIdentity;
  showValidation?: boolean;
}) {
  const { t, locale } = useLocale();
  const acceptanceId = useId();
  const acceptanceErrorId = useId();
  const documentsId = useId();
  const contractId = useId();
  const signerId = useId();
  const signerErrorId = useId();
  const signatureErrorId = useId();
  const required = subjectType === "venue" ? VENUE_REQUIRED_DOCS : PARTNER_REQUIRED_DOCS;

  const docs = useMemo(
    () =>
      required
        .map((slug) => LEGAL_DOCUMENTS.find((d) => d.slug === slug))
        .filter((d): d is (typeof LEGAL_DOCUMENTS)[number] => Boolean(d)),
    [required],
  );

  const [acceptedDocuments, setAcceptedDocuments] = useState(false);
  const [name, setName] = useState(defaultName);
  const [signatureKey, setSignatureKey] = useState(0);
  const [signature, setSignature] = useState<SignatureValue>({
    dataUrl: null,
    isValid: false,
  });
  // §5 asks for different details depending on what the partner is, so the
  // form follows the contract rather than inventing its own fields.
  const [partnerType, setPartnerType] = useState<PartnerType>(initialIdentity?.partnerType ?? "individual");
  const [legalName, setLegalName] = useState(initialIdentity?.legalName ?? "");
  const [idNumber, setIdNumber] = useState(initialIdentity?.idNumber ?? "");
  const [legalAddress, setLegalAddress] = useState(initialIdentity?.legalAddress ?? "");
  const [representativeName, setRepresentativeName] = useState(initialIdentity?.representativeName ?? "");
  const [contractOpen, setContractOpen] = useState(false);
  const [contractRead, setContractRead] = useState(false);
  // Returning to this onboarding step mounts a blank form. The parent must
  // not keep the accepted signature from the instance that was left behind.
  const initialChange = useRef(onChange);
  const initialValue = useRef<ESignatureValue>({
    signatureName: defaultName.trim(),
    signatureImage: null,
    accepted: false,
    documents: docs.map((doc) => doc.slug),
    identity: initialIdentity ?? { partnerType: "individual", legalName: "", idNumber: null, legalAddress: null, representativeName: null },
    validationIssues: signatureIssues({
      acceptedDocuments: false,
      identity: initialIdentity ?? { partnerType: "individual", legalName: "", idNumber: null, legalAddress: null, representativeName: null },
      name: defaultName.trim(),
      signature: { dataUrl: null, isValid: false },
    }),
  });
  useLayoutEffect(() => {
    initialChange.current?.(initialValue.current);
  }, []);

  const isEntity = partnerType !== "individual";
  const identity: PartnerIdentity = {
    partnerType,
    legalName: legalName.trim(),
    idNumber: idNumber.trim() || null,
    legalAddress: legalAddress.trim() || null,
    representativeName: isEntity ? representativeName.trim() || null : null,
  };
  /** Required for signing, never a condition for opening the document. */
  const identityValidation = validatePartnerIdentity(identity);
  const identityOk = identityValidation.ok;

  /** The main agreement shown in the optional expandable preview. */
  const mainDoc = docs[0];

  const nameOk = signerMatchesIdentity(name, identity);
  const validationIssues = signatureIssues({
    acceptedDocuments,
    identity,
    name,
    signature,
  });
  // These remain required: the tick is the signer's explicit acceptance, the
  // typed name identifies them, and the drawing is the handwritten signature.
  const valid =
    docs.length > 0 && validationIssues.length === 0;

  function emit(
    nextAccepted: boolean,
    nextName: string,
    nextSig: SignatureValue = signature,
    nextIdentity: PartnerIdentity = identity,
  ) {
    if (JSON.stringify(nextIdentity) !== JSON.stringify(identity)) {
      // Changing the contracting party invalidates the earlier consent and
      // signature. Reset the optional preview progress as its Annex changes.
      setSignatureKey(k => k + 1);
      setContractRead(false);
      setSignature({ dataUrl: null, isValid: false });
      setAcceptedDocuments(false);
      nextAccepted = false;
      nextSig = { dataUrl: null, isValid: false };
    }
    const issues = signatureIssues({
      acceptedDocuments: nextAccepted,
      identity: nextIdentity,
      name: nextName,
      signature: nextSig,
    });
    onChange?.({
      signatureName: nextName.trim(),
      signatureImage: nextSig.dataUrl,
      accepted: docs.length > 0 && issues.length === 0,
      documents: docs.map((d) => d.slug),
      identity: nextIdentity,
      validationIssues: issues,
    });
  }

  function issueMessage(issue: ESignatureIssue): string {
    switch (issue) {
      case "legalName":
        return t(isEntity
          ? "legal.legalNameEntityError"
          : "legal.legalNameIndividualError");
      case "idNumber":
        return t(isEntity
          ? "legal.idNumberEntityError"
          : "legal.idNumberIndividualError");
      case "legalAddress":
        return t(isEntity
          ? "legal.legalAddressEntityError"
          : "legal.legalAddressIndividualError");
      case "representativeName":
        return t("legal.representativeNameError");
      case "documentsAccepted":
        return t("legal.documentsAcceptedError");
      case "signatureName":
        return t("legal.signatureNameError");
      case "signatureImage":
        return t("legal.signatureImageError");
    }
  }

  return (
    <div data-no-auto-translate translate="no" className="rounded-2xl border border-gold/25 bg-gold/[0.04] p-5">
      <div className="mb-4 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
        <div>
          <p className="font-semibold">
            {t("legal.signTitle")}
          </p>
          <p className="text-sm text-muted-foreground">
            {locale === "ru" ? "Прочитайте перечисленные документы, подтвердите согласие с ними и поставьте подпись ниже." : locale === "en" ? "Read the listed documents, confirm your agreement and add your signature below." : "Citește documentele enumerate, confirmă acordul tău și semnează mai jos."}
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
                emit(acceptedDocuments, name, signature, {
                  ...identity,
                  partnerType: value,
                  representativeName: value === "individual" ? null : representativeName.trim() || null,
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
            maxLength={200}
            error={identityValidation.fields.legalName
              ? issueMessage("legalName")
              : undefined}
            showError={showValidation || legalName.trim().length > 0}
            onChange={(v) => {
              setLegalName(v);
              emit(acceptedDocuments, name, signature, {
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
            error={identityValidation.fields.idNumber
              ? issueMessage("idNumber")
              : undefined}
            showError={showValidation || idNumber.trim().length > 0}
            inputMode="numeric"
            pattern={`[0-9]{${MOLDOVAN_ID_NUMBER_LENGTH}}`}
            maxLength={MOLDOVAN_ID_NUMBER_LENGTH}
            onChange={(v) => {
              setIdNumber(v);
              emit(acceptedDocuments, name, signature, {
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
            maxLength={300}
            error={identityValidation.fields.legalAddress
              ? issueMessage("legalAddress")
              : undefined}
            showError={showValidation || legalAddress.trim().length > 0}
            onChange={(v) => {
              setLegalAddress(v);
              emit(acceptedDocuments, name, signature, {
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
              maxLength={200}
              error={identityValidation.fields.representativeName
                ? issueMessage("representativeName")
                : undefined}
              showError={showValidation || representativeName.trim().length > 0}
              onChange={(v) => {
                setRepresentativeName(v);
                emit(acceptedDocuments, name, signature, {
                  ...identity,
                  representativeName: v.trim() || null,
                });
              }}
              className="sm:col-span-2"
            />
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-background/40 p-3 sm:p-4">
        <label htmlFor={acceptanceId} className="flex cursor-pointer items-start gap-3 text-sm font-medium">
          <input
            id={acceptanceId}
            type="checkbox"
            checked={acceptedDocuments}
            aria-invalid={showValidation && !acceptedDocuments}
            aria-describedby={`${documentsId}${showValidation && !acceptedDocuments ? ` ${acceptanceErrorId}` : ""}`}
            onChange={(event) => {
              const checked = event.target.checked;
              setAcceptedDocuments(checked);
              emit(checked, name);
            }}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#C9A84C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          />
          <span>
            {locale === "ru" ? "Я прочитал(а) и согласен(на) со следующими документами:" : locale === "en" ? "I have read and agree to the following documents:" : "Am citit și sunt de acord cu următoarele documente:"}
          </span>
        </label>
        <ol id={documentsId} className="mt-3 space-y-2 pl-8 text-sm">
          {docs.map((doc, index) => (
            <li key={doc.slug} className="flex items-start gap-2">
              <span className="shrink-0 text-muted-foreground">{index + 1}.</span>
              <Link
                href={`/legal/${doc.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 font-medium text-gold hover:underline"
              >
                {legalTitle(doc, locale)}
              </Link>
              <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ol>
        {showValidation && !acceptedDocuments && (
          <p id={acceptanceErrorId} className="mt-2 text-xs text-destructive">
            {issueMessage("documentsAccepted")}
          </p>
        )}
      </div>

      {/* 2 — the agreement itself, with their details in it, before any
             signing happens. */}
      {mainDoc && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setContractOpen((v) => !v)}
            aria-expanded={contractOpen}
            aria-controls={contractId}
            className="flex w-full items-center justify-between rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/10"
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
              {locale === "ru" ? "Договор доступен для чтения сейчас. Перед подписанием заполните все реквизиты выше: они автоматически появятся в договоре." : locale === "en" ? "You can read the contract now. Before signing, complete the details above: they will appear in the contract automatically." : "Poți citi contractul acum. Înainte de semnare, completează datele de mai sus: acestea vor apărea automat în contract."}
            </p>
          )}
          <div id={contractId} hidden={!contractOpen} className="mt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              {t("legal.contractWithYourData")}
            </p>
            <ContractReader
              key={`${subjectType}-${signatureKey}`}
              doc={mainDoc}
              locale={locale}
              partner={identity}
              showVersion={false}
              onReachedEnd={() => {
                setContractRead(true);
              }}
              // Shown at the foot of the document as it is given, so the
              // page reads as a signed contract rather than a form sitting
              // next to one.
              signature={
                nameOk && signature.isValid
                  ? { name: name.trim(), image: signature.dataUrl }
                  : null
              }
            />
          </div>
          {contractRead && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-green-500">
              <Check className="h-3.5 w-3.5" />
              {t("legal.contractRead")}
            </p>
          )}
        </div>
      )}

      {/* 3 — and only now, the signature. */}
      <div className="mt-4">
        <label htmlFor={signerId} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("legal.fullName")}
        </label>
        <input
          id={signerId}
          value={name}
          required
          aria-invalid={(showValidation || name.length > 0) && !nameOk}
          aria-describedby={(showValidation || name.length > 0) && !nameOk
            ? signerErrorId
            : undefined}
          onChange={(e) => {
            setName(e.target.value);
            emit(acceptedDocuments, e.target.value);
          }}
          placeholder="Ion Popescu"
          className={`h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-gold ${
            (showValidation || name.length > 0) && !nameOk
              ? "border-destructive"
              : "border-border"
          }`}
        />
        {!nameOk && (showValidation || name.length > 0) && (
          <p id={signerErrorId} className="mt-1 text-xs text-destructive">
            {issueMessage("signatureName")}
          </p>
        )}
      </div>

      <div className="mt-4">
        <SignaturePad
          key={signatureKey}
          invalid={showValidation && !signature.isValid}
          describedBy={signatureErrorId}
          onChange={(v) => {
            setSignature(v);
            emit(acceptedDocuments, name, v);
          }}
        />
        {showValidation && !signature.isValid && (
          <p id={signatureErrorId} className="mt-1 text-xs text-destructive">
            {issueMessage("signatureImage")}
          </p>
        )}
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
      {showValidation && validationIssues.length > 0 && (
        <div
          role="alert"
          data-agreement-validation
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="flex items-start gap-2 font-medium text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {t("legal.completeBeforeSubmit")}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-8 text-xs text-muted-foreground">
            {validationIssues.map((issue) => (
              <li key={issue}>{issueMessage(issue)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function IdField({
  label,
  value,
  onChange,
  error,
  showError = false,
  inputMode,
  pattern,
  maxLength,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  showError?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  pattern?: string;
  maxLength?: number;
  className?: string;
}) {
  const inputId = useId();
  const errorId = useId();
  const invalid = Boolean(showError && error);
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        required
        inputMode={inputMode}
        pattern={pattern}
        maxLength={maxLength}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-gold ${
          invalid ? "border-destructive" : "border-border"
        }`}
      />
      {invalid && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
