"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { TranslateMissingFields } from "@/components/vendor/translate-missing-fields";
import { localizePath } from "@/lib/i18n/routing";
import { useLocale } from "@/hooks/use-locale";

type HallForm = {
  nameRo: string;
  nameRu: string;
  nameEn: string;
  descriptionRo: string;
  descriptionRu: string;
  descriptionEn: string;
  capacityMin: string;
  capacityMax: string;
  pricingModel: "per_person" | "minimum_order" | "fixed" | "quote";
  basePrice: string;
  minimumOrder: string;
  currency: string;
  depositType: "none" | "percent" | "fixed";
  depositValue: string;
  bookingTermsRo: string;
  bookingTermsRu: string;
  bookingTermsEn: string;
  seatingMax: string;
};

const empty: HallForm = {
  nameRo: "",
  nameRu: "",
  nameEn: "",
  descriptionRo: "",
  descriptionRu: "",
  descriptionEn: "",
  capacityMin: "50",
  capacityMax: "200",
  pricingModel: "quote",
  basePrice: "",
  minimumOrder: "",
  currency: "EUR",
  depositType: "none",
  depositValue: "",
  bookingTermsRo: "",
  bookingTermsRu: "",
  bookingTermsEn: "",
  seatingMax: "",
};

export function HallEditor({ venueId, hallId }: { venueId: number; hallId?: number }) {
  const { locale } = useLocale();
  const router = useRouter();
  const [form, setForm] = useState<HallForm>(empty);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!hallId) return;
    void fetch(`/api/venues/${venueId}/halls/${hallId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.hall) return;
        const hall = data.hall as Record<string, unknown>;
        setForm({
          nameRo: String(hall.nameRo ?? ""),
          nameRu: String(hall.nameRu ?? ""),
          nameEn: String(hall.nameEn ?? ""),
          descriptionRo: String(hall.descriptionRo ?? ""),
          descriptionRu: String(hall.descriptionRu ?? ""),
          descriptionEn: String(hall.descriptionEn ?? ""),
          capacityMin: hall.capacityMin != null ? String(hall.capacityMin) : "",
          capacityMax: hall.capacityMax != null ? String(hall.capacityMax) : "",
          pricingModel: (hall.pricingModel as HallForm["pricingModel"]) || "quote",
          basePrice: hall.basePrice != null ? String(hall.basePrice) : "",
          minimumOrder: hall.minimumOrder != null ? String(hall.minimumOrder) : "",
          currency: String(hall.currency ?? "EUR"),
          depositType: (hall.depositType as HallForm["depositType"]) || "none",
          depositValue: hall.depositValue != null ? String(hall.depositValue) : "",
          bookingTermsRo: String(hall.bookingTermsRo ?? ""),
          bookingTermsRu: String(hall.bookingTermsRu ?? ""),
          bookingTermsEn: String(hall.bookingTermsEn ?? ""),
          seatingMax: "",
        });
      });
  }, [venueId, hallId]);

  function set<K extends keyof HallForm>(key: K, value: HallForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldError(null);
  }

  async function save(submit = false) {
    setBusy(true);
    try {
      const payload = {
        hallId,
        nameRo: form.nameRo,
        nameRu: form.nameRu || null,
        nameEn: form.nameEn || null,
        descriptionRo: form.descriptionRo || null,
        descriptionRu: form.descriptionRu || null,
        descriptionEn: form.descriptionEn || null,
        capacityMin: form.capacityMin ? Number(form.capacityMin) : undefined,
        capacityMax: form.capacityMax ? Number(form.capacityMax) : undefined,
        pricingModel: form.pricingModel,
        basePrice: form.basePrice ? Number(form.basePrice) : null,
        minimumOrder: form.minimumOrder ? Number(form.minimumOrder) : null,
        currency: form.currency,
        depositType: form.depositType,
        depositValue: form.depositValue ? Number(form.depositValue) : null,
        bookingTermsRo: form.bookingTermsRo || null,
        bookingTermsRu: form.bookingTermsRu || null,
        bookingTermsEn: form.bookingTermsEn || null,
        seating: form.seatingMax
          ? [{ type: "banquet" as const, capacityMin: Number(form.capacityMin || 1), capacityMax: Number(form.seatingMax) }]
          : [],
      };
      const res = await fetch(hallId ? `/api/venues/${venueId}/halls/${hallId}` : `/api/venues/${venueId}/halls`, {
        method: hallId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFieldError(data.details?.[0]?.path?.join(".") || data.field || "form");
        toast.error(data.error || "Validare eșuată — formularul rămâne editabil");
        return;
      }
      toast.success("Draft salvat");
      const id = hallId || data.hall?.id;
      if (submit) {
        const send = await fetch(`/api/venues/${venueId}/submit-approval`, { method: "POST" });
        const sendData = await send.json().catch(() => ({}));
        if (!send.ok) {
          const first = sendData.missing?.[0];
          setFieldError(first?.path || "submit");
          toast.error(first?.message || "Lipsesc câmpuri — revino și editează");
          return;
        }
      }
      if (id) router.replace(localizePath(`/dashboard/locatii/${venueId}/sali/${id}`, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h1 className="font-heading text-2xl font-bold">{hallId ? "Editează sala" : "Adaugă sală"}</h1>
        {fieldError && <p className="text-sm text-red-400">Câmp: {fieldError}</p>}
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Nume RO</Label>
            <Input value={form.nameRo} onChange={(e) => set("nameRo", e.target.value)} />
          </div>
          <div>
            <Label>Nume RU</Label>
            <Input value={form.nameRu} onChange={(e) => set("nameRu", e.target.value)} />
          </div>
          <div>
            <Label>Nume EN</Label>
            <Input value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
          </div>
        </div>
        <TranslateMissingFields
          venueId={venueId}
          hallId={hallId}
          fields={{
            name: { ro: form.nameRo, ru: form.nameRu, en: form.nameEn },
            description: { ro: form.descriptionRo, ru: form.descriptionRu, en: form.descriptionEn },
            bookingTerms: { ro: form.bookingTermsRo, ru: form.bookingTermsRu, en: form.bookingTermsEn },
          }}
          onTranslated={(next) => {
            setForm((prev) => ({
              ...prev,
              nameRu: next.name?.ru ?? prev.nameRu,
              nameEn: next.name?.en ?? prev.nameEn,
              descriptionRu: next.description?.ru ?? prev.descriptionRu,
              descriptionEn: next.description?.en ?? prev.descriptionEn,
              bookingTermsRu: next.bookingTerms?.ru ?? prev.bookingTermsRu,
              bookingTermsEn: next.bookingTerms?.en ?? prev.bookingTermsEn,
            }));
          }}
        />
        <Textarea placeholder="Descriere RO" value={form.descriptionRo} onChange={(e) => set("descriptionRo", e.target.value)} />
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Capacitate min</Label>
            <Input type="number" value={form.capacityMin} onChange={(e) => set("capacityMin", e.target.value)} />
          </div>
          <div>
            <Label>Capacitate max</Label>
            <Input type="number" value={form.capacityMax} onChange={(e) => set("capacityMax", e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Model preț</Label>
            <select
              className="h-9 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
              value={form.pricingModel}
              onChange={(e) => set("pricingModel", e.target.value as HallForm["pricingModel"])}
            >
              <option value="per_person">per_person</option>
              <option value="minimum_order">minimum_order</option>
              <option value="fixed">fixed</option>
              <option value="quote">quote</option>
            </select>
          </div>
          <div>
            <Label>Avans</Label>
            <select
              className="h-9 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
              value={form.depositType}
              onChange={(e) => set("depositType", e.target.value as HallForm["depositType"])}
            >
              <option value="none">none</option>
              <option value="percent">percent</option>
              <option value="fixed">fixed</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save(false)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvează draft"}
          </Button>
          <Button type="button" className="bg-gold text-[#0D0D0D] hover:bg-gold-dark" disabled={busy} onClick={() => void save(true)}>
            Trimite la aprobare
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
