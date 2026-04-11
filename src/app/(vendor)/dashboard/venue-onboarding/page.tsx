// M12 — Venue owner registration wizard. Mirrors the artist onboarding but
// collects venue-specific fields (capacity, address).

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, CheckCircle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export default function VenueOnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState({
    name: "",
    phone: "",
    city: "Chișinău",
    address: "",
    capacityMin: 50,
    capacityMax: 200,
    description: "",
  });

  function update(partial: Partial<typeof data>) {
    setData((prev) => ({ ...prev, ...partial }));
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
          description: data.description,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Eroare la înregistrare");
      }
      toast.success(
        "Sala a fost trimisă pentru aprobare! Vei fi notificat când administratorul o aprobă.",
      );
      router.push("/dashboard/venue-profil");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eroare la înregistrare");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-gold" />
        <h1 className="font-heading text-2xl font-bold">Înregistrare Sală</h1>
        <p className="mt-1 text-muted-foreground">
          Completează datele pentru a publica sala ta pe ePetrecere.md
        </p>
      </div>

      <div className="mb-10 flex justify-center gap-3">
        {["Date de bază", "Capacitate", "Confirmare"].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                i < step
                  ? "bg-gold text-background"
                  : i === step
                    ? "bg-gold text-background ring-4 ring-gold/20"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className="hidden text-xs sm:inline">{label}</span>
            {i < 2 && (
              <div
                className={cn("h-0.5 w-8", i < step ? "bg-gold" : "bg-muted")}
              />
            )}
          </div>
        ))}
      </div>

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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Oraș</Label>
              <Input
                value={data.city}
                onChange={(e) => update({ city: e.target.value })}
              />
            </div>
            <div>
              <Label>Adresă</Label>
              <Input
                value={data.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="Str. ..."
              />
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
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Capacitate</h2>
          <p className="text-sm text-muted-foreground">
            Câți invitați poți găzdui? Valorile pot fi ajustate oricând din profil.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Minim invitați</Label>
              <Input
                type="number"
                value={data.capacityMin}
                onChange={(e) => update({ capacityMin: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Maxim invitați</Label>
              <Input
                type="number"
                value={data.capacityMax}
                onChange={(e) => update({ capacityMax: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-heading text-lg font-bold">Confirmă datele</h2>
          <div className="space-y-2 text-sm">
            <Row k="Nume" v={data.name} />
            <Row k="Telefon" v={data.phone} />
            <Row k="Oraș" v={data.city} />
            {data.address && <Row k="Adresă" v={data.address} />}
            <Row k="Capacitate" v={`${data.capacityMin} — ${data.capacityMax}`} />
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
        {step < 2 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={step === 0 ? !data.name || !data.phone : false}
            className="gap-2 bg-gold text-background hover:bg-gold-dark"
          >
            Continuă <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-2 bg-gold text-background hover:bg-gold-dark"
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
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}:</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
