"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/shared/image-upload";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowRight, ArrowLeft, User, Camera, Tag, CheckCircle, Sparkles } from "lucide-react";

const STEPS = [
  { label: "Profil de bază", icon: User },
  { label: "Poze", icon: Camera },
  { label: "Categorii & Prețuri", icon: Tag },
];

const categoryOptions = [
  "Cântăreți", "Moderatori / MC", "DJ", "Formații", "Fotografi",
  "Videografi", "Decor", "Animatori", "Show Program", "Echipament",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    name: "", phone: "", location: "", description: "",
    images: [] as { id: string; url: string; alt: string; isCover: boolean }[],
    categories: [] as string[],
    priceFrom: "",
  });

  function update(partial: Partial<typeof data>) {
    setData((prev) => ({ ...prev, ...partial }));
  }

  function finish() {
    toast.success("Profilul tău a fost creat! Bine ai venit pe ePetrecere.md!");
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="mb-8 text-center">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-gold" />
        <h1 className="font-heading text-2xl font-bold">Bine ai venit pe ePetrecere.md!</h1>
        <p className="mt-1 text-muted-foreground">Completează profilul în 3 pași simpli</p>
      </div>

      {/* Progress */}
      <div className="mb-10 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium",
              i < step ? "bg-gold text-background" : i === step ? "bg-gold text-background ring-4 ring-gold/20" : "bg-muted text-muted-foreground",
            )}>
              {i < step ? <CheckCircle className="h-5 w-5" /> : <s.icon className="h-4 w-4" />}
            </div>
            {i < STEPS.length - 1 && <div className={cn("mx-2 h-0.5 w-12", i < step ? "bg-gold" : "bg-muted")} />}
          </div>
        ))}
      </div>

      {/* Step 1: Basic profile */}
      {step === 0 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Informații de bază</h2>
          <div><Label>Nume artistic *</Label><Input value={data.name} onChange={(e) => update({ name: e.target.value })} placeholder="Ex: Ion Suruceanu" /></div>
          <div><Label>Telefon *</Label><Input value={data.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="+373 69 ..." /></div>
          <div><Label>Oraș</Label><Input value={data.location} onChange={(e) => update({ location: e.target.value })} placeholder="Chișinău" /></div>
          <div><Label>Scurtă descriere</Label><Textarea value={data.description} onChange={(e) => update({ description: e.target.value })} rows={4} placeholder="Spune câteva cuvinte despre tine..." /></div>
        </div>
      )}

      {/* Step 2: Photos */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Adaugă minimum 3 poze</h2>
          <p className="text-sm text-muted-foreground">Pozele de calitate atrag mai mulți clienți.</p>
          <ImageUpload images={data.images} onChange={(images) => update({ images })} maxFiles={10} />
        </div>
      )}

      {/* Step 3: Categories & Price */}
      {step === 2 && (
        <div className="space-y-6 rounded-xl border border-border/40 bg-card p-6">
          <div>
            <h2 className="font-heading text-lg font-bold">Selectează categoriile</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {categoryOptions.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    const cats = data.categories.includes(cat)
                      ? data.categories.filter((c) => c !== cat)
                      : [...data.categories, cat];
                    update({ categories: cats });
                  }}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm transition-all",
                    data.categories.includes(cat) ? "border-gold bg-gold/10 text-gold font-medium" : "border-border/40 hover:border-gold/30",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Preț de la (EUR)</Label>
            <Input type="number" value={data.priceFrom} onChange={(e) => update({ priceFrom: e.target.value })} placeholder="200" className="max-w-xs" />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Înapoi
        </Button>
        {step < 2 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={step === 0 && (!data.name || !data.phone)}
            className="bg-gold text-background hover:bg-gold-dark gap-2"
          >
            Continuă <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finish} className="bg-gold text-background hover:bg-gold-dark gap-2">
            <CheckCircle className="h-4 w-4" /> Finalizează
          </Button>
        )}
      </div>
    </div>
  );
}
