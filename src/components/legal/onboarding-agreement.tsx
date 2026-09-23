"use client";

import { FileText, Loader2, ShieldCheck } from "lucide-react";
import Link from "@/components/shared/locale-link";
import { useLocale } from "@/hooks/use-locale";
import type { useOnboardingAgreement } from "@/hooks/use-onboarding-agreement";
import type { PartnerIdentity } from "@/lib/legal";
import { ESignature, type ESignatureValue } from "./e-signature";
import { onboardingAgreementText } from "./onboarding-agreement-text";

export function OnboardingAgreement({
  subjectType,
  agreement,
  onChange,
  initialIdentity,
  showValidation = false,
}: {
  subjectType: "artist" | "venue";
  agreement: ReturnType<typeof useOnboardingAgreement>;
  onChange: (value: ESignatureValue) => void;
  initialIdentity?: PartnerIdentity;
  showValidation?: boolean;
}) {
  const { locale } = useLocale();
  const text = onboardingAgreementText[locale];
  if (agreement.loading) return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{text.loading}</p>;
  if (agreement.error) return <div role="alert" className="space-y-3 rounded-xl border border-amber-500/40 p-4 text-sm">
    <p>{text.unavailable}</p><button type="button" className="text-gold underline" onClick={() => void agreement.refresh().catch(() => {})}>{text.retry}</button>
  </div>;
  if (agreement.value?.status === "blocked") return <div role="alert" className="space-y-3 rounded-xl border border-amber-500/40 p-4 text-sm">
    <p>{text.blocked}</p><Link href="/contact" className="text-gold underline">{text.contact}</Link>
  </div>;
  const saved = agreement.value?.agreement;
  if (!saved) return <ESignature
    key={`${subjectType}-${locale}`}
    subjectType={subjectType}
    onChange={onChange}
    initialIdentity={initialIdentity}
    showValidation={showValidation}
  />;

  const fields = [
    [text.kind, text[saved.identity.partnerType]],
    [text.party, saved.identity.legalName],
    [text.identifier, saved.identity.idNumber],
    [text.address, saved.identity.legalAddress],
    [text.representative, saved.identity.representativeName],
    [text.role, saved.representativeRole],
    [text.signer, saved.signatureName],
    [text.signedAt, new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Chisinau" }).format(new Date(saved.acceptedAt))],
    [text.language, { ro: "Română", ru: "Русский", en: "English" }[saved.locale]],
  ];
  return <section data-no-auto-translate translate="no" aria-label={text.title} className="min-w-0 space-y-5 rounded-2xl border border-gold/30 bg-gold/[0.04] p-4 sm:p-5">
    <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><div>
      <h3 className="font-semibold">{text.title}</h3><p className="mt-2 text-sm text-muted-foreground">{text.intro}</p>
    </div></div>
    <dl className="space-y-3 rounded-xl border border-border/50 bg-background/40 p-4 text-sm">
      {fields.filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd>
      </div>)}
    </dl>
    <div><p className="mb-2 text-sm font-medium">{text.documents}</p><ul className="space-y-2">
      {saved.documents.map(doc => <li key={doc.id}><a href={doc.copyUrl} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 text-sm text-gold underline underline-offset-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{doc.title}</span>
      </a></li>)}
    </ul></div>
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><p>{text.correction}</p><Link href="/contact" className="text-gold underline">{text.contact}</Link></div>
  </section>;
}
