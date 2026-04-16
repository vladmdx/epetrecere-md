"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Heart,
  Cake,
  Baby,
  Briefcase,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

interface Template {
  id: number;
  slug: string;
  nameRo: string;
  category: string | null;
  designTokens: Record<string, string> | null;
}

interface Guest {
  name: string;
  email?: string;
  phone?: string;
  group?: string;
}

const EVENT_TYPES = [
  { value: "wedding", label: "Nuntă", icon: Heart },
  { value: "birthday", label: "Aniversare", icon: Cake },
  { value: "baptism", label: "Botez / Cumătrie", icon: Baby },
  { value: "corporate", label: "Corporate", icon: Briefcase },
] as const;

const STEPS = [
  "Alege template",
  "Detalii eveniment",
  "Lista de invitați",
  "Revizuire & publicare",
];

export function InvitationWizard() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState({
    templateId: 0,
    eventType: "wedding" as "wedding" | "birthday" | "baptism" | "corporate",
    coupleNames: "",
    hostName: "",
    eventDate: "",
    ceremonyTime: "",
    receptionTime: "",
    ceremonyLocation: "",
    receptionLocation: "",
    message: "",
    dressCode: "",
    rsvpDeadline: "",
    allowPlusOne: true,
    guests: [] as Guest[],
  });
  const [newGuest, setNewGuest] = useState<Guest>({ name: "", email: "" });

  useEffect(() => {
    fetch("/api/invitation-templates")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates);
  }, []);

  // Filter templates by event type when picking
  const filteredTemplates = templates.filter(
    (t) => !t.category || t.category === data.eventType,
  );

  function update<K extends keyof typeof data>(
    key: K,
    value: (typeof data)[K],
  ) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function addGuest() {
    if (!newGuest.name.trim()) return;
    setData((d) => ({ ...d, guests: [...d.guests, { ...newGuest }] }));
    setNewGuest({ name: "", email: "" });
  }

  function removeGuest(index: number) {
    setData((d) => ({
      ...d,
      guests: d.guests.filter((_, i) => i !== index),
    }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return !!data.eventType && data.templateId > 0;
      case 1:
        return (
          !!data.eventDate &&
          !!(data.coupleNames || data.hostName) &&
          !!data.ceremonyLocation
        );
      case 2:
        return true; // guests optional
      case 3:
        return true;
      default:
        return false;
    }
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Eroare la salvare");
        return;
      }
      const created = await res.json();
      router.push(`/cabinet/invitatii/${created.id}`);
    } catch {
      alert("Eroare de rețea");
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else void handleSubmit();
  }

  function prev() {
    if (step > 0) setStep(step - 1);
  }

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center lg:px-8">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center lg:px-8">
        <h1 className="font-heading text-2xl font-bold">Autentifică-te</h1>
        <Link
          href="/sign-in?redirect_url=/cabinet/invitatii/nou"
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
        >
          Conectează-te
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <div className="text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
          Pas {step + 1} din {STEPS.length}
        </p>
        <h1 className="font-heading text-2xl font-bold md:text-3xl">
          {STEPS[step]}
        </h1>
      </div>
      <Progress
        value={((step + 1) / STEPS.length) * 100}
        className="mt-6 h-1.5"
      />

      <div className="mt-10 min-h-[400px]">
        {/* STEP 0 — Template */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <Label className="mb-3 block">Tipul evenimentului</Label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {EVENT_TYPES.map((et) => {
                  const Icon = et.icon;
                  const active = data.eventType === et.value;
                  return (
                    <button
                      key={et.value}
                      type="button"
                      onClick={() => {
                        update("eventType", et.value);
                        update("templateId", 0);
                      }}
                      className={`rounded-xl border p-4 text-center transition-all ${
                        active
                          ? "border-gold bg-gold/10"
                          : "border-border/40 bg-card hover:border-gold/30"
                      }`}
                    >
                      <Icon className="mx-auto h-5 w-5 text-gold" />
                      <div className="mt-1 text-sm font-medium">
                        {et.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="mb-3 block">Template de design</Label>
              {filteredTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nu sunt template-uri pentru acest tip încă.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredTemplates.map((t) => {
                    const active = data.templateId === t.id;
                    const tokens = t.designTokens ?? {};
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => update("templateId", t.id)}
                        className={`rounded-xl border p-4 text-left transition-all ${
                          active
                            ? "border-gold bg-gold/10"
                            : "border-border/40 bg-card hover:border-gold/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{t.nameRo}</div>
                          {active && <Check className="h-4 w-4 text-gold" />}
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          {(["primary", "secondary"] as const).map((k) => (
                            <div
                              key={k}
                              className="h-4 w-4 rounded-full border border-border/40"
                              style={{ background: tokens[k] || "#ccc" }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 1 — Details */}
        {step === 1 && (
          <div className="space-y-4">
            {data.eventType === "wedding" ? (
              <div>
                <Label>Numele mirilor</Label>
                <Input
                  value={data.coupleNames}
                  onChange={(e) => update("coupleNames", e.target.value)}
                  placeholder="Ana & Ion"
                  className="mt-2"
                />
              </div>
            ) : (
              <div>
                <Label>Numele sărbătoritului / gazdei</Label>
                <Input
                  value={data.hostName}
                  onChange={(e) => update("hostName", e.target.value)}
                  placeholder="Maria"
                  className="mt-2"
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Data evenimentului</Label>
                <Input
                  type="date"
                  value={data.eventDate}
                  onChange={(e) => update("eventDate", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Termen limită RSVP</Label>
                <Input
                  type="date"
                  value={data.rsvpDeadline}
                  onChange={(e) => update("rsvpDeadline", e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Ora cununiei / ceremoniei</Label>
                <Input
                  type="time"
                  value={data.ceremonyTime}
                  onChange={(e) => update("ceremonyTime", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Ora petrecerii</Label>
                <Input
                  type="time"
                  value={data.receptionTime}
                  onChange={(e) => update("receptionTime", e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
            <div>
              <Label>Locația ceremoniei</Label>
              <Input
                value={data.ceremonyLocation}
                onChange={(e) => update("ceremonyLocation", e.target.value)}
                placeholder="Biserica Sf. Nicolae, Chișinău"
                className="mt-2"
              />
            </div>
            <div>
              <Label>Locația petrecerii</Label>
              <Input
                value={data.receptionLocation}
                onChange={(e) => update("receptionLocation", e.target.value)}
                placeholder="Restaurant Andys, Chișinău"
                className="mt-2"
              />
            </div>
            <div>
              <Label>Mesaj pentru invitați (opțional)</Label>
              <Textarea
                value={data.message}
                onChange={(e) => update("message", e.target.value)}
                placeholder="Cu drag vă invităm să ne fiți alături..."
                rows={3}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Cod vestimentar (opțional)</Label>
              <Input
                value={data.dressCode}
                onChange={(e) => update("dressCode", e.target.value)}
                placeholder="Ținută elegantă"
                className="mt-2"
              />
            </div>
          </div>
        )}

        {/* STEP 2 — Guests */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Adaugă invitații acum sau mai târziu. Fiecare invitat primește un
              link RSVP unic.
            </p>
            <div className="rounded-xl border border-border/40 bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  placeholder="Nume"
                  value={newGuest.name}
                  onChange={(e) =>
                    setNewGuest({ ...newGuest, name: e.target.value })
                  }
                />
                <Input
                  placeholder="Email (opțional)"
                  value={newGuest.email || ""}
                  onChange={(e) =>
                    setNewGuest({ ...newGuest, email: e.target.value })
                  }
                />
                <Button
                  type="button"
                  onClick={addGuest}
                  disabled={!newGuest.name.trim()}
                  className="gap-1 bg-gold text-background hover:bg-gold-dark"
                >
                  <Plus className="h-4 w-4" /> Adaugă
                </Button>
              </div>
            </div>
            {data.guests.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-card">
                <div className="border-b border-border/40 p-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {data.guests.length} invitați
                </div>
                <ul className="divide-y divide-border/40">
                  {data.guests.map((g, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between p-3 text-sm"
                    >
                      <div>
                        <div className="font-medium">{g.name}</div>
                        {g.email && (
                          <div className="text-xs text-muted-foreground">
                            {g.email}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGuest(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.allowPlusOne}
                onChange={(e) => update("allowPlusOne", e.target.checked)}
                className="h-4 w-4 accent-gold"
              />
              Permite invitaților să aducă un însoțitor (+1)
            </label>
          </div>
        )}

        {/* STEP 3 — Review */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/40 bg-card p-5">
              <h3 className="font-heading font-bold">Rezumat invitație</h3>
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tip:</dt>
                  <dd className="font-medium">
                    {EVENT_TYPES.find((e) => e.value === data.eventType)?.label}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Nume:</dt>
                  <dd className="font-medium">
                    {data.coupleNames || data.hostName || "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Data:</dt>
                  <dd className="font-medium">{data.eventDate || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Locație:</dt>
                  <dd className="font-medium">
                    {data.ceremonyLocation || "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Invitați:</dt>
                  <dd className="font-medium">{data.guests.length}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm text-muted-foreground">
              După creare, invitația va fi salvată ca <strong>ciornă</strong>.
              O poți edita, previzualiza și publica oricând din panoul tău.
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-between gap-3">
        <Button
          variant="outline"
          onClick={prev}
          disabled={step === 0 || saving}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Înapoi
        </Button>
        <Button
          onClick={next}
          disabled={!canAdvance() || saving}
          className="gap-2 bg-gold text-background hover:bg-gold-dark"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : step === STEPS.length - 1 ? (
            <>
              <Check className="h-4 w-4" /> Creează invitația
            </>
          ) : (
            <>
              Continuă <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
