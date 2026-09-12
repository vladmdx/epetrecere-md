"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingAgreement } from "@/components/legal/onboarding-agreement";
import { useOnboardingAgreement } from "@/hooks/use-onboarding-agreement";
import { onboardingSubmitDisabled } from "@/lib/legal/onboarding-submit";
import { localizePath } from "@/lib/i18n/routing";
import { useLocale } from "@/hooks/use-locale";
import { MOLDOVA_CITIES, DEFAULT_CITY } from "@/lib/moldova-cities";
import type { ESignatureValue } from "@/components/legal/e-signature";
import { TranslateMissingFields } from "@/components/vendor/translate-missing-fields";

const STEPS = ["Organizație", "Contract", "Local", "Sală", "Trimitere"];

type Missing = { step: string; field: string; message: string; path: string };

export default function MultiHallVenueOnboarding() {
  const { locale } = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useUser();
  const presetOrg = Number(search.get("organizationId") || "") || null;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [organizationId, setOrganizationId] = useState<number | null>(presetOrg);
  const [venueId, setVenueId] = useState<number | null>(null);
  const [hallId, setHallId] = useState<number | null>(null);
  const [hasContract, setHasContract] = useState(false);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [signature, setSignature] = useState<ESignatureValue | null>(null);
  const [showAgreementValidation, setShowAgreementValidation] = useState(false);
  const agreement = useOnboardingAgreement("venue", user?.id, locale, organizationId ?? undefined);
  const [org, setOrg] = useState({ displayName: "", type: "company" as "individual" | "sole_trader" | "company", legalName: "", idNumber: "", legalAddress: "", billingEmail: "", billingPhone: "" });
  const [venue, setVenue] = useState({ name: "", phone: "", city: DEFAULT_CITY, address: "", descriptionRo: "", nameRu: "", nameEn: "", descriptionRu: "", descriptionEn: "" });
  const [hall, setHall] = useState({ nameRo: "Sala principală", nameRu: "", nameEn: "", capacityMin: "50", capacityMax: "200", pricingModel: "quote" as const });

  useEffect(() => {
    void fetch("/api/partner/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const first = data?.drafts?.[0];
        if (!first) return;
        const organization = first.organization;
        if (organization && (presetOrg == null || organization.id === presetOrg)) {
          setOrganizationId(organization.id);
          setHasContract(Boolean(first.hasValidContract));
          setOrg((prev) => ({
            ...prev,
            displayName: organization.displayName ?? "",
            type: organization.type ?? "company",
            legalName: organization.legalName ?? "",
            idNumber: organization.idNumber ?? "",
            legalAddress: organization.legalAddress ?? "",
            billingEmail: organization.billingEmail ?? "",
            billingPhone: organization.billingPhone ?? "",
          }));
        }
        const v = first.venues?.[0];
        if (v) {
          setVenueId(v.id);
          setVenue({
            name: v.nameRo ?? "",
            phone: v.phone ?? "",
            city: v.city ?? DEFAULT_CITY,
            address: v.address ?? "",
            descriptionRo: v.descriptionRo ?? "",
            nameRu: v.nameRu ?? "",
            nameEn: v.nameEn ?? "",
            descriptionRu: v.descriptionRu ?? "",
            descriptionEn: v.descriptionEn ?? "",
          });
          const h = v.halls?.[0];
          if (h) {
            setHallId(h.id);
            setHall({
              nameRo: h.nameRo ?? "Sala principală",
              nameRu: h.nameRu ?? "",
              nameEn: h.nameEn ?? "",
              capacityMin: String(h.capacityMin ?? 50),
              capacityMax: String(h.capacityMax ?? 200),
              pricingModel: "quote",
            });
          }
          if (v.missing) setMissing(v.missing);
        }
      });
  }, [presetOrg]);

  function jumpToMissing(list: Missing[]) {
    setMissing(list);
    const first = list[0];
    if (!first) return;
    const map: Record<string, number> = { organization: 0, legal: 1, contract: 1, venue: 2, hall: 3, submit: 4 };
    setStep(map[first.step] ?? 0);
    toast.error(first.message);
  }

  async function saveOrg() {
    setBusy(true);
    try {
      const method = organizationId ? "PATCH" : "POST";
      const url = organizationId ? `/api/organizations/${organizationId}` : "/api/organizations";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(org) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Organizația nu a putut fi salvată");
        return false;
      }
      setOrganizationId(data.organization.id);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function saveVenue() {
    if (!organizationId) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/venues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...venue, organizationId, venueId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Localul nu a putut fi salvat");
        return false;
      }
      setVenueId(data.venue.id);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function saveHall() {
    if (!venueId) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/venues/${venueId}/halls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hallId,
          nameRo: hall.nameRo,
          nameRu: hall.nameRu || null,
          nameEn: hall.nameEn || null,
          capacityMin: Number(hall.capacityMin),
          capacityMax: Number(hall.capacityMax),
          pricingModel: hall.pricingModel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Sala nu a putut fi salvată");
        return false;
      }
      setHallId(data.hall.id);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (step === 0 && !(await saveOrg())) return;
    if (step === 1 && !hasContract) {
      try {
        await agreement.prepare(signature);
        setHasContract(true);
      } catch (error) {
        setShowAgreementValidation(true);
        toast.error(error instanceof Error ? error.message : "Semnează contractul");
        return;
      }
    }
    if (step === 2 && !(await saveVenue())) return;
    if (step === 3 && !(await saveHall())) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    if (!venueId) {
      toast.error("Salvează localul mai întâi");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/venues/${venueId}/submit-approval`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        jumpToMissing(data.missing ?? []);
        return;
      }
      toast.success("Trimis la aprobare");
      router.push(localizePath("/dashboard/locatii", locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <h1 className="font-heading text-2xl font-bold">Înregistrare local</h1>
      <div className="flex gap-2 text-xs">
        {STEPS.map((label, i) => (
          <span key={label} className={i === step ? "text-gold font-medium" : "text-muted-foreground"}>{i + 1}. {label}</span>
        ))}
      </div>
      {missing[0] && <p className="text-sm text-red-400">Lipsește: {missing[0].path} — {missing[0].message}</p>}

      {step === 0 && (
        <div className="space-y-3">
          <Label>Nume organizație</Label>
          <Input value={org.displayName} onChange={(e) => setOrg({ ...org, displayName: e.target.value })} />
          <Label>Tip</Label>
          <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={org.type} onChange={(e) => setOrg({ ...org, type: e.target.value as typeof org.type })}>
            <option value="company">company</option>
            <option value="sole_trader">sole_trader</option>
            <option value="individual">individual</option>
          </select>
          <Label>Denumire juridică</Label>
          <Input value={org.legalName} onChange={(e) => setOrg({ ...org, legalName: e.target.value })} />
          <Label>IDNP/IDNO</Label>
          <Input value={org.idNumber} onChange={(e) => setOrg({ ...org, idNumber: e.target.value })} />
          <Label>Adresă juridică</Label>
          <Input value={org.legalAddress} onChange={(e) => setOrg({ ...org, legalAddress: e.target.value })} />
          <Label>Email billing</Label>
          <Input value={org.billingEmail} onChange={(e) => setOrg({ ...org, billingEmail: e.target.value })} />
          <Label>Telefon billing</Label>
          <Input value={org.billingPhone} onChange={(e) => setOrg({ ...org, billingPhone: e.target.value })} />
        </div>
      )}

      {step === 1 && (
        hasContract ? (
          <p className="text-sm text-emerald-400">Contractul organizației este valabil. Un local nou nu cere re-semnare.</p>
        ) : (
          <OnboardingAgreement
            subjectType="venue"
            agreement={agreement}
            onChange={setSignature}
            showValidation={showAgreementValidation}
          />
        )
      )}

      {step === 2 && (
        <div className="space-y-3">
          <Label>Nume local</Label>
          <Input value={venue.name} onChange={(e) => setVenue({ ...venue, name: e.target.value })} />
          <Label>Telefon</Label>
          <Input value={venue.phone} onChange={(e) => setVenue({ ...venue, phone: e.target.value })} />
          <Label>Oraș</Label>
          <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={venue.city} onChange={(e) => setVenue({ ...venue, city: e.target.value })}>
            {MOLDOVA_CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
          <Label>Adresă</Label>
          <Input value={venue.address} onChange={(e) => setVenue({ ...venue, address: e.target.value })} />
          <Textarea placeholder="Descriere RO" value={venue.descriptionRo} onChange={(e) => setVenue({ ...venue, descriptionRo: e.target.value })} />
          {venueId && (
            <TranslateMissingFields
              venueId={venueId}
              fields={{ name: { ro: venue.name, ru: venue.nameRu, en: venue.nameEn }, description: { ro: venue.descriptionRo, ru: venue.descriptionRu, en: venue.descriptionEn } }}
              onTranslated={(next) => setVenue((prev) => ({ ...prev, nameRu: next.name?.ru ?? prev.nameRu, nameEn: next.name?.en ?? prev.nameEn, descriptionRu: next.description?.ru ?? prev.descriptionRu, descriptionEn: next.description?.en ?? prev.descriptionEn }))}
            />
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <Label>Nume sală RO</Label>
          <Input value={hall.nameRo} onChange={(e) => setHall({ ...hall, nameRo: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Min invitați</Label>
              <Input type="number" value={hall.capacityMin} onChange={(e) => setHall({ ...hall, capacityMin: e.target.value })} />
            </div>
            <div>
              <Label>Max invitați</Label>
              <Input type="number" value={hall.capacityMax} onChange={(e) => setHall({ ...hall, capacityMax: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3 text-sm">
          <p>Organizație #{organizationId} · Local #{venueId} · Sală #{hallId}</p>
          <p>Butonul rămâne activ. Serverul întoarce câmpurile lipsă; formularul rămâne editabil.</p>
        </div>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Înapoi
        </Button>
        {step < 4 ? (
          <Button type="button" className="bg-gold text-[#0D0D0D]" disabled={busy} onClick={() => void next()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continuă <ArrowRight className="ml-1 h-4 w-4" /></>}
          </Button>
        ) : (
          <Button
            type="button"
            className="bg-gold text-[#0D0D0D]"
            disabled={onboardingSubmitDisabled({ busy, agreementLoading: agreement.loading, agreementStatus: hasContract ? "resumable" : agreement.value?.status })}
            onClick={() => void submit()}
          >
            Trimite la aprobare
          </Button>
        )}
      </div>
    </div>
  );
}
