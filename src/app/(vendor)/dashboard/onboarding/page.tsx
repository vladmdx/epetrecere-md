"use client";

// Partner onboarding — extended flow:
//   Step 0: Pick category
//   Step 1: Name + Photo
//   Step 2: Description (with AI-generate button — needs ≥ 40 chars input)
//   Step 3: Location + travel preferences
//   Step 4: Pricing (priceFrom + travel surcharge)
//   Step 5: Confirmation
//
// Phone is captured at registration. The submit endpoint
// (/api/auth/register-artist) creates the artist row in the DB and the
// follow-up PATCH (/api/artists/crud PUT) saves the extended fields.

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Upload,
  Loader2,
  Camera,
  Wand2,
  MapPin,
  Euro,
} from "lucide-react";
import {
  MOLDOVA_CITIES,
  TRAVEL_DISTANCE_OPTIONS,
} from "@/lib/moldova-cities";

interface Category {
  id: number;
  nameRo: string;
  slug: string;
  type: string;
}

const STEP_LABELS = [
  "Categorie",
  "Date personale",
  "Descriere",
  "Locație & deplasare",
  "Preț",
  "Confirmare",
];

const MIN_AI_INPUT = 40;

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [data, setData] = useState({
    name: "",
    location: "Chișinău",
    categoryId: 0,
    imageUrl: "",
    description: "",
    baseCity: "Chișinău",
    travelDistanceKm: 30,
    travelSurchargeEnabled: false,
    travelSurchargeAmount: 0,
    priceFrom: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((cats) =>
        setCategories(cats.filter((c: Category) => c.type === "artist")),
      )
      .catch(() => toast.error("Nu s-au putut încărca categoriile"));

    if (user) {
      setData((d) => ({
        ...d,
        name: user.fullName || "",
        imageUrl: user.imageUrl || "",
      }));
    }
  }, [user]);

  function update(partial: Partial<typeof data>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selectează o imagine validă");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Imaginea nu poate depăși 10MB");
      return;
    }
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "avatars");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const { url } = await res.json();
      update({ imageUrl: url });
      toast.success("Poza încărcată!");
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Nu s-a putut încărca imaginea";
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Generate description via AI. Requires ≥ 40 chars of input from the user
  // first — used as the seed for Claude. Without that, the AI can't produce
  // anything specific, so we gate the button.
  async function handleGenerateAi() {
    if (data.description.trim().length < MIN_AI_INPUT) {
      toast.error(
        `Scrie minim ${MIN_AI_INPUT} caractere despre tine, apoi AI-ul va îmbunătăți textul.`,
      );
      return;
    }
    const category = categories.find((c) => c.id === data.categoryId);
    if (!category) {
      toast.error("Selectează mai întâi categoria");
      return;
    }
    setGeneratingAi(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "description",
          name: data.name || "Artistul",
          category: category.nameRo,
          location: data.baseCity,
          existing: data.description,
          language: "ro",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Generarea a eșuat");
      }
      const { description } = await res.json();
      if (description) {
        update({ description });
        toast.success("Descriere generată cu AI!");
      } else {
        toast.error("AI nu a returnat un rezultat valid");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la generare AI");
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // 1. Create the artist row (same endpoint as before).
      const res = await fetch("/api/auth/register-artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: "",
          categoryId: data.categoryId,
          location: data.location,
          imageUrl: data.imageUrl,
          description: data.description || undefined,
          priceFrom: data.priceFrom > 0 ? data.priceFrom : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { artistId } = await res.json();

      // 2. PATCH the extended fields (travel + base city) via the artist
      // crud endpoint. Fire-and-forget so a transient failure here doesn't
      // block the success toast — admins can fix from /admin/artisti later.
      if (artistId) {
        try {
          await fetch("/api/artists/crud", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: artistId,
              baseCity: data.baseCity,
              travelDistanceKm: data.travelDistanceKm,
              travelSurchargeEnabled: data.travelSurchargeEnabled,
              travelSurchargeAmount: data.travelSurchargeEnabled
                ? data.travelSurchargeAmount
                : null,
            }),
          });
        } catch {
          /* ignore — non-critical */
        }
      }

      toast.success(
        "Profilul a fost trimis pentru aprobare! Vei fi notificat când administratorul îl aprobă.",
      );
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la înregistrare");
    } finally {
      setSubmitting(false);
    }
  }

  function canContinue(): boolean {
    switch (step) {
      case 0:
        return !!data.categoryId;
      case 1:
        return !!data.name.trim();
      case 2:
        return true; // description is optional
      case 3:
        return !!data.baseCity;
      case 4:
        return true; // price is optional
      default:
        return false;
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-gold" />
        <h1 className="font-heading text-2xl font-bold">Înregistrare Partener</h1>
        <p className="mt-1 text-muted-foreground">
          Completează profilul pentru a fi vizibil pe ePetrecere.md
        </p>
      </div>

      {/* Progress */}
      <div className="mb-10 flex flex-wrap justify-center gap-2 sm:gap-3">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
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

      {/* Step 0: Category */}
      {step === 0 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Alege categoria ta</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => update({ categoryId: cat.id })}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-all",
                  data.categoryId === cat.id
                    ? "border-gold bg-gold/10 text-gold font-medium"
                    : "border-border/40 hover:border-gold/30",
                )}
              >
                {cat.nameRo}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Name + Photo */}
      {step === 1 && (
        <div className="space-y-5 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Datele tale</h2>

          <div>
            <Label>Poză de profil</Label>
            <div className="mt-2 flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted">
                {data.imageUrl ? (
                  <Image
                    src={data.imageUrl}
                    alt="Profil"
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    <Camera className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {data.imageUrl ? "Schimbă poza" : "Încarcă poza"}
                </Button>
                {data.imageUrl && (
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline"
                    onClick={() => update({ imageUrl: "" })}
                  >
                    Șterge poza
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label>Nume artistic *</Label>
            <Input
              value={data.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Ex: Ion Suruceanu"
            />
          </div>
        </div>
      )}

      {/* Step 2: Description (with AI) */}
      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold">Descriere</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Spune-le clienților ce te face deosebit. Scrie minim {MIN_AI_INPUT}{" "}
              caractere și apoi apasă <strong>Generează cu AI</strong> ca să-ți
              îmbunătățim textul automat.
            </p>
          </div>
          <textarea
            value={data.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Ex: Cânt la nunți și evenimente private de peste 10 ani. Repertoriu variat — populară, pop, retro. Dispun de echipament propriu..."
            rows={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {data.description.length} caractere
              {data.description.trim().length < MIN_AI_INPUT && (
                <span className="text-amber-500 ml-1">
                  (minim {MIN_AI_INPUT} pentru AI)
                </span>
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateAi}
              disabled={generatingAi || data.description.trim().length < MIN_AI_INPUT}
              className="gap-1.5 border-gold/40 text-gold hover:bg-gold/10"
            >
              {generatingAi ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Generează cu AI
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Location & travel */}
      {step === 3 && (
        <div className="space-y-5 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-gold" />
              Locație și deplasare
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Stabilește unde activezi și cât de departe te deplasezi. Aceste
              setări determină ce clienți te văd în rezultate.
            </p>
          </div>

          <div>
            <Label>Orașul de bază *</Label>
            <select
              value={data.baseCity}
              onChange={(e) => update({ baseCity: e.target.value, location: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            >
              {MOLDOVA_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Punctul de pornire pentru calculul distanței.
            </p>
          </div>

          <div>
            <Label>Distanța maximă de deplasare</Label>
            <select
              value={data.travelDistanceKm}
              onChange={(e) => update({ travelDistanceKm: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            >
              {TRAVEL_DISTANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Cât de departe ești dispus să mergi pentru un eveniment.
            </p>
          </div>

          <div className="rounded-lg border border-border/40 bg-background/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label>Plată suplimentară pentru deplasare</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Activează dacă percepi extra pentru evenimente în afara orașului
                  de bază.
                </p>
              </div>
              <input
                type="checkbox"
                checked={data.travelSurchargeEnabled}
                onChange={(e) => update({ travelSurchargeEnabled: e.target.checked })}
                className="mt-1.5 h-4 w-4 rounded border-input"
              />
            </div>
            {data.travelSurchargeEnabled && (
              <div className="flex items-center gap-3">
                <Label className="flex-1">Sumă (€)</Label>
                <Input
                  type="number"
                  min={0}
                  value={data.travelSurchargeAmount || ""}
                  onChange={(e) => update({ travelSurchargeAmount: Number(e.target.value) })}
                  className="w-32"
                  placeholder="ex: 100"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Pricing */}
      {step === 4 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold flex items-center gap-2">
              <Euro className="h-5 w-5 text-gold" />
              Preț de start
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Tariful tău minim pentru un eveniment. Clienții vor vedea „de la X
              €" pe profilul tău. Tarife detaliate (ore, weekend, sezon) se
              setează ulterior din /dashboard/tarife.
            </p>
          </div>
          <div>
            <Label>Preț de start (€) — opțional</Label>
            <Input
              type="number"
              min={0}
              value={data.priceFrom || ""}
              onChange={(e) => update({ priceFrom: Number(e.target.value) })}
              placeholder="ex: 200"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Lasă gol dacă încă nu ai un preț stabilit — îl poți adăuga ulterior.
            </p>
          </div>
        </div>
      )}

      {/* Step 5: Confirm */}
      {step === 5 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Confirmă datele</h2>
          {data.imageUrl && (
            <div className="flex justify-center">
              <div className="relative h-28 w-28 overflow-hidden rounded-xl border border-gold/30">
                <Image
                  src={data.imageUrl}
                  alt="Profil"
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              </div>
            </div>
          )}
          <div className="space-y-2 text-sm">
            <SummaryRow label="Categorie" value={categories.find((c) => c.id === data.categoryId)?.nameRo ?? "—"} />
            <SummaryRow label="Nume" value={data.name} />
            <SummaryRow label="Oraș de bază" value={data.baseCity} />
            <SummaryRow
              label="Deplasare"
              value={TRAVEL_DISTANCE_OPTIONS.find((o) => o.value === data.travelDistanceKm)?.label ?? "—"}
            />
            {data.travelSurchargeEnabled && (
              <SummaryRow label="Plată deplasare" value={`${data.travelSurchargeAmount}€`} />
            )}
            {data.priceFrom > 0 && <SummaryRow label="Preț de start" value={`${data.priceFrom}€`} />}
            {data.description && (
              <div className="rounded-lg bg-muted/40 p-3 mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Descriere</p>
                <p className="text-sm whitespace-pre-wrap">{data.description}</p>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-warning/10 border border-warning/30 p-4 text-sm text-warning">
            După trimitere, profilul tău va fi verificat de administrator. Vei
            primi notificare când profilul este aprobat și va fi vizibil pe site.
          </div>
        </div>
      )}

      {/* Navigation */}
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
            className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2"
          >
            Continuă <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2"
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
