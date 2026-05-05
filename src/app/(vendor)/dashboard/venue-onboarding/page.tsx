"use client";

// Venue owner registration wizard — extended flow:
//   Step 0: Date de bază (name, phone, address — required)
//   Step 1: Capacitate
//   Step 2: Foto galerie (≥ 1 photo required, up to 10)
//   Step 3: Extras (menu PDF, menu URL, virtual tour, website — all optional)
//   Step 4: Confirmare

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Building2,
  Upload,
  Loader2,
  X,
  Camera,
  FileText,
  Globe,
  PlayCircle,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MOLDOVA_CITIES, DEFAULT_CITY } from "@/lib/moldova-cities";
import { MapsAutofill } from "@/components/vendor/maps-autofill";

const STEP_LABELS = [
  "Date de bază",
  "Capacitate",
  "Foto",
  "Extra",
  "Confirmare",
];

export default function VenueOnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [resubmit, setResubmit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState({
    name: "",
    phone: "",
    city: DEFAULT_CITY,
    address: "",
    capacityMin: 50,
    capacityMax: 200,
    description: "",
    imageUrls: [] as string[],
    menuPdfUrl: "",
    menuUrl: "",
    virtualTourUrl: "",
    websiteUrl: "",
  });

  // Pre-fill the form if the user already has a venue submission. Approved
  // venues redirect to the dashboard (admin-edit only). Pending ones load
  // their existing data so the user can fix what was wrong and re-submit
  // without re-entering everything from scratch.
  useEffect(() => {
    let alive = true;
    fetch("/api/me/venue", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { venue: null }))
      .then((res: { venue: Record<string, unknown> | null; images?: Array<{ url: string }> }) => {
        if (!alive) return;
        const v = res?.venue;
        if (!v) return;
        if (v.isActive) {
          // Already approved — bounce them into the dashboard. They can edit
          // through /dashboard/sala/profil from there.
          router.replace("/dashboard/sala");
          return;
        }
        // Pending — pre-fill the wizard so they can finish/correct + re-submit.
        setResubmit(true);
        setData({
          name: (v.nameRo as string) || "",
          phone: (v.phone as string) || "",
          city: (v.city as string) || DEFAULT_CITY,
          address: (v.address as string) || "",
          capacityMin: Number(v.capacityMin) || 50,
          capacityMax: Number(v.capacityMax) || 200,
          description: (v.descriptionRo as string) || "",
          imageUrls: Array.isArray(res.images) ? res.images.map((i) => i.url) : [],
          menuPdfUrl: (v.menuPdfUrl as string) || "",
          menuUrl: (v.menuUrl as string) || "",
          virtualTourUrl: (v.virtualTourUrl as string) || "",
          websiteUrl: (v.website as string) || "",
        });
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingExisting(false);
      });
    return () => {
      alive = false;
    };
  }, [router]);

  function update(partial: Partial<typeof data>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  async function uploadFile(file: File, folder: "venues" | "uploads"): Promise<string | null> {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fișierul nu poate depăși 10MB");
      return null;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", folder);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Upload eșuat");
      return null;
    }
    const { url } = await res.json();
    return url;
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (data.imageUrls.length + files.length > 10) {
      toast.error("Maxim 10 imagini permise");
      return;
    }
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name}: nu este imagine validă`);
          continue;
        }
        const url = await uploadFile(file, "venues");
        if (url) newUrls.push(url);
      }
      if (newUrls.length > 0) {
        update({ imageUrls: [...data.imageUrls, ...newUrls] });
        toast.success(`${newUrls.length} ${newUrls.length === 1 ? "imagine încărcată" : "imagini încărcate"}`);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleMenuUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Selectează un fișier PDF");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, "venues");
      if (url) {
        update({ menuPdfUrl: url });
        toast.success("Meniu PDF încărcat");
      }
    } finally {
      setUploading(false);
      if (menuInputRef.current) menuInputRef.current.value = "";
    }
  }

  function setCoverPhoto(idx: number) {
    if (idx === 0) return;
    const next = [...data.imageUrls];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    update({ imageUrls: next });
  }

  function removePhoto(idx: number) {
    update({ imageUrls: data.imageUrls.filter((_, i) => i !== idx) });
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          email: user?.primaryEmailAddress?.emailAddress,
          city: data.city,
          address: data.address,
          capacityMin: data.capacityMin,
          capacityMax: data.capacityMax,
          description: data.description || undefined,
          imageUrls: data.imageUrls,
          menuPdfUrl: data.menuPdfUrl || undefined,
          menuUrl: data.menuUrl || undefined,
          virtualTourUrl: data.virtualTourUrl || undefined,
          websiteUrl: data.websiteUrl || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Eroare la înregistrare");
      }
      toast.success(
        "Sala a fost trimisă pentru aprobare! Vei fi notificat când administratorul o aprobă.",
      );
      router.push("/dashboard/sala");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eroare la înregistrare");
    } finally {
      setSubmitting(false);
    }
  }

  function canContinue(): boolean {
    switch (step) {
      case 0:
        return !!data.name.trim() && !!data.phone.trim() && !!data.address.trim();
      case 1:
        return data.capacityMin > 0 && data.capacityMax >= data.capacityMin;
      case 2:
        return data.imageUrls.length >= 1; // at least one photo required
      case 3:
        return true; // optional step
      default:
        return false;
    }
  }

  // While we check whether the user has an existing pending submission,
  // show a small spinner instead of an empty form. Cheaper UX than a flash
  // of "Înregistrare" → "Editează cererea".
  if (loadingExisting) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-gold" />
        <h1 className="font-heading text-2xl font-bold">
          {resubmit ? "Editează cererea" : "Înregistrare Sală"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {resubmit
            ? "Cererea ta este în așteptare. Poți modifica datele și retrimite — nu trebuie să o creezi de la zero."
            : "Completează datele pentru a publica sala ta pe ePetrecere.md"}
        </p>
      </div>

      <div className="mb-10 flex flex-wrap justify-center gap-2 sm:gap-3">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                i < step
                  ? "bg-gold text-[#0D0D0D]"
                  : i === step
                    ? "bg-gold text-[#0D0D0D] ring-4 ring-gold/20"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className="hidden text-xs sm:inline">{label}</span>
            {i < STEP_LABELS.length - 1 && (
              <div className={cn("h-0.5 w-6 sm:w-8", i < step ? "bg-gold" : "bg-muted")} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Date de bază */}
      {step === 0 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Despre sală</h2>
          <div>
            <Label>Numele sălii *</Label>
            <Input
              value={data.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Ex: Restaurant Royal Palace"
            />
          </div>
          <div>
            <Label>Telefon *</Label>
            <Input
              value={data.phone}
              onChange={(e) => update({ phone: e.target.value })}
              placeholder="+373 69 ..."
            />
          </div>
          {/* Google Maps autofill — paste the venue's Maps URL and we
              pre-fill name, address, city, phone, website and (when
              GOOGLE_PLACES_API_KEY is set) a draft description. We never
              overwrite values the owner has already typed. */}
          <MapsAutofill
            onResult={(r) => {
              update({
                name: data.name || r.placeName || data.name,
                phone: data.phone || r.phone || data.phone,
                address: r.address || data.address,
                city:
                  r.city && MOLDOVA_CITIES.includes(r.city)
                    ? r.city
                    : data.city,
                websiteUrl: data.websiteUrl || r.website || data.websiteUrl,
                description: data.description || r.summary || data.description,
              });
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Oraș *</Label>
              <select
                value={data.city}
                onChange={(e) => update({ city: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              >
                {MOLDOVA_CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Adresă completă *</Label>
              <Input
                value={data.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="Str. ..."
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Strada, numărul. Vizibilă pe profilul public.
              </p>
            </div>
          </div>
          <div>
            <Label>Scurtă descriere</Label>
            <Textarea
              value={data.description}
              onChange={(e) => update({ description: e.target.value })}
              rows={4}
              placeholder="Ce face sala ta specială..."
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Opțional — poți completa și mai târziu.
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Capacitate */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Capacitate</h2>
          <p className="text-sm text-muted-foreground">
            Câți invitați poți găzdui? Filtrăm rezultatele clienților după
            capacitatea solicitată.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Minim invitați *</Label>
              <Input
                type="number"
                min={1}
                value={data.capacityMin}
                onChange={(e) => update({ capacityMin: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Maxim invitați *</Label>
              <Input
                type="number"
                min={1}
                value={data.capacityMax}
                onChange={(e) => update({ capacityMax: Number(e.target.value) })}
              />
            </div>
          </div>
          {data.capacityMax < data.capacityMin && (
            <p className="text-xs text-destructive">
              Maxim trebuie să fie ≥ minim.
            </p>
          )}
        </div>
      )}

      {/* Step 2: Foto */}
      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold flex items-center gap-2">
              <Camera className="h-5 w-5 text-gold" />
              Galerie foto
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Încarcă cel puțin <strong>o imagine</strong> a sălii. Prima
              imagine devine fotografia principală (apare pe card). Maxim 10
              imagini, fiecare până la 10MB.
            </p>
          </div>

          {/* Photo grid */}
          {data.imageUrls.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.imageUrls.map((url, idx) => (
                <div key={url} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border/40">
                  <Image src={url} alt="" fill sizes="200px" className="object-cover" />
                  {idx === 0 && (
                    <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-[#0D0D0D]">
                      <Star className="h-3 w-3" /> Principal
                    </div>
                  )}
                  <div className="absolute right-2 top-2 flex gap-1">
                    {idx !== 0 && (
                      <button
                        type="button"
                        onClick={() => setCoverPhoto(idx)}
                        className="rounded-full bg-black/60 p-1 text-white hover:bg-black"
                        title="Setează ca principal"
                      >
                        <Star className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="rounded-full bg-black/60 p-1 text-white hover:bg-destructive"
                      title="Șterge"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || data.imageUrls.length >= 10}
            className="gap-2 w-full"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {data.imageUrls.length === 0 ? "Încarcă prima imagine" : `Adaugă imagini (${data.imageUrls.length}/10)`}
          </Button>
        </div>
      )}

      {/* Step 3: Extra */}
      {step === 3 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold">Detalii suplimentare</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Toate câmpurile sunt opționale — completează ce ai la îndemână, restul poți adăuga ulterior din profil.
            </p>
          </div>

          {/* Meniu PDF */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gold" />
              Meniu (PDF)
            </Label>
            {data.menuPdfUrl ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-sm">
                <a href={data.menuPdfUrl} target="_blank" rel="noopener" className="text-gold hover:underline truncate">
                  📎 {data.menuPdfUrl.split("/").pop()}
                </a>
                <button
                  type="button"
                  onClick={() => update({ menuPdfUrl: "" })}
                  className="text-xs text-destructive hover:underline shrink-0"
                >
                  Șterge
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={menuInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleMenuUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => menuInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Încarcă PDF
                </Button>
              </>
            )}
            <p className="text-[10px] text-muted-foreground">
              Sau lipește un URL extern dacă meniul tău e găzduit pe alt site.
            </p>
            <Input
              value={data.menuUrl}
              onChange={(e) => update({ menuUrl: e.target.value })}
              placeholder="https://restaurantul-tau.md/meniu"
              className="text-sm"
            />
          </div>

          {/* Virtual Tour */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-gold" />
              Virtual Tour (link)
            </Label>
            <Input
              value={data.virtualTourUrl}
              onChange={(e) => update({ virtualTourUrl: e.target.value })}
              placeholder="https://www.matterport.com/show/?m=..."
            />
            <p className="text-[10px] text-muted-foreground">
              Suportăm Matterport, Kuula, YouTube 360°. Apare ca iframe pe
              profilul public.
            </p>
          </div>

          {/* Website */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-gold" />
              Site web
            </Label>
            <Input
              value={data.websiteUrl}
              onChange={(e) => update({ websiteUrl: e.target.value })}
              placeholder="https://restaurantul-tau.md"
            />
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Confirmă datele</h2>
          {data.imageUrls[0] && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-gold/30">
              <Image src={data.imageUrls[0]} alt={data.name} fill sizes="600px" className="object-cover" />
            </div>
          )}
          <div className="space-y-2 text-sm">
            <Row k="Nume" v={data.name} />
            <Row k="Telefon" v={data.phone} />
            <Row k="Oraș" v={data.city} />
            <Row k="Adresă" v={data.address} />
            <Row k="Capacitate" v={`${data.capacityMin} — ${data.capacityMax} invitați`} />
            <Row k="Imagini" v={`${data.imageUrls.length} încărcate`} />
            {data.menuPdfUrl && <Row k="Meniu PDF" v="✓ încărcat" />}
            {data.menuUrl && <Row k="Meniu URL" v={data.menuUrl} />}
            {data.virtualTourUrl && <Row k="Virtual Tour" v="✓ adăugat" />}
            {data.websiteUrl && <Row k="Site web" v={data.websiteUrl} />}
          </div>
          {data.description && (
            <p className="rounded-lg bg-accent/50 p-3 text-sm text-muted-foreground">
              {data.description}
            </p>
          )}
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            După trimitere, sala ta va fi verificată de administrator. Vei primi
            notificare când este aprobată și va fi vizibilă pe site.
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Înapoi
        </Button>
        {step < STEP_LABELS.length - 1 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canContinue()}
            className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            Continuă <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {submitting ? (
              "Se trimite..."
            ) : (
              <>
                <CheckCircle className="h-4 w-4" /> Trimite pentru aprobare
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}:</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}
