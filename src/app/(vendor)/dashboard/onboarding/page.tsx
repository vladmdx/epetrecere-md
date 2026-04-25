"use client";

// Partner onboarding — minimal flow:
//   Step 0: Pick category
//   Step 1: Name + Location + Profile photo
//   Step 2: Confirmation
//
// Phone is captured at registration (not here). Description is edited
// later via the Profile page.

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
} from "lucide-react";

interface Category {
  id: number;
  nameRo: string;
  slug: string;
  type: string;
}

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
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
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

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register-artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          // Phone comes from the user record (captured at registration).
          // Send empty string here — the API enriches from users table.
          phone: "",
          categoryId: data.categoryId,
          location: data.location,
          imageUrl: data.imageUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
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
      <div className="mb-10 flex justify-center gap-3">
        {["Categorie", "Date personale", "Confirmare"].map((label, i) => (
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
            {i < 2 && (
              <div className={cn("h-0.5 w-8", i < step ? "bg-gold" : "bg-muted")} />
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

      {/* Step 1: Name + Location + Photo */}
      {step === 1 && (
        <div className="space-y-5 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Datele tale</h2>

          {/* Profile photo upload */}
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
          <div>
            <Label>Oraș</Label>
            <Input
              value={data.location}
              onChange={(e) => update({ location: e.target.value })}
              placeholder="Chișinău"
            />
          </div>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 2 && (
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Categorie:</span>
              <span className="font-medium">
                {categories.find((c) => c.id === data.categoryId)?.nameRo}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nume:</span>
              <span className="font-medium">{data.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Oraș:</span>
              <span className="font-medium">{data.location}</span>
            </div>
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
        {step < 2 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={step === 0 ? !data.categoryId : !data.name}
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
