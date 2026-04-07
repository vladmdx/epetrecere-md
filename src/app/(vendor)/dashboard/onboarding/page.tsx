"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowRight, ArrowLeft, CheckCircle, Sparkles, Music, Camera, Mic, Disc3, Guitar } from "lucide-react";

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
    name: "", phone: "", location: "Chișinău",
    description: "", categoryId: 0, imageUrl: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(cats => setCategories(cats.filter((c: Category) => c.type === "artist")))
      .catch(() => {});

    if (user) {
      setData(d => ({ ...d, name: user.fullName || "" }));
    }
  }, [user]);

  function update(partial: Partial<typeof data>) {
    setData(prev => ({ ...prev, ...partial }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register-artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkUserId: user?.id,
          email: user?.primaryEmailAddress?.emailAddress,
          name: data.name,
          phone: data.phone,
          categoryId: data.categoryId,
          description: data.description,
          location: data.location,
          imageUrl: data.imageUrl,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Profilul a fost trimis pentru aprobare! Vei fi notificat când administratorul îl aprobă.");
      router.push("/dashboard");
    } catch {
      toast.error("Eroare la înregistrare");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-gold" />
        <h1 className="font-heading text-2xl font-bold">Înregistrare Artist</h1>
        <p className="mt-1 text-muted-foreground">Completează profilul pentru a fi vizibil pe ePetrecere.md</p>
      </div>

      {/* Progress */}
      <div className="mb-10 flex justify-center gap-3">
        {["Categorie", "Date personale", "Confirmare"].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
              i < step ? "bg-gold text-background" : i === step ? "bg-gold text-background ring-4 ring-gold/20" : "bg-muted text-muted-foreground",
            )}>
              {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className="hidden text-xs sm:inline">{label}</span>
            {i < 2 && <div className={cn("h-0.5 w-8", i < step ? "bg-gold" : "bg-muted")} />}
          </div>
        ))}
      </div>

      {/* Step 0: Category */}
      {step === 0 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Alege categoria ta</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => update({ categoryId: cat.id })}
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-all",
                  data.categoryId === cat.id ? "border-gold bg-gold/10 text-gold font-medium" : "border-border/40 hover:border-gold/30",
                )}
              >
                {cat.nameRo}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Personal info */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Datele tale</h2>
          <div><Label>Nume artistic *</Label><Input value={data.name} onChange={e => update({ name: e.target.value })} placeholder="Ex: Ion Suruceanu" /></div>
          <div><Label>Telefon *</Label><Input value={data.phone} onChange={e => update({ phone: e.target.value })} placeholder="+373 69 ..." /></div>
          <div><Label>Oraș</Label><Input value={data.location} onChange={e => update({ location: e.target.value })} placeholder="Chișinău" /></div>
          <div><Label>Despre tine</Label><Textarea value={data.description} onChange={e => update({ description: e.target.value })} rows={4} placeholder="Scurtă descriere..." /></div>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Confirmă datele</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Categorie:</span><span className="font-medium">{categories.find(c => c.id === data.categoryId)?.nameRo}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Nume:</span><span className="font-medium">{data.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Telefon:</span><span className="font-medium">{data.phone}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Oraș:</span><span className="font-medium">{data.location}</span></div>
          </div>
          {data.description && <p className="text-sm text-muted-foreground bg-accent/50 rounded-lg p-3">{data.description}</p>}
          <div className="rounded-lg bg-warning/10 border border-warning/30 p-4 text-sm text-warning">
            După trimitere, profilul tău va fi verificat de administrator. Vei primi notificare când profilul este aprobat și va fi vizibil pe site.
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
            disabled={step === 0 ? !data.categoryId : !data.name || !data.phone}
            className="bg-gold text-background hover:bg-gold-dark gap-2"
          >
            Continuă <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting} className="bg-gold text-background hover:bg-gold-dark gap-2">
            {submitting ? "Se trimite..." : <><CheckCircle className="h-4 w-4" /> Trimite pentru aprobare</>}
          </Button>
        )}
      </div>
    </div>
  );
}
