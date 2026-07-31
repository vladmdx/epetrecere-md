"use client";

import { useState } from "react";
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
import { INVITATION_DESIGN_LIST, type InvitationDesignId } from "@/lib/invitations/templates";
import { TimePicker } from "@/components/ui/time-picker";
import { Calendar as CalendarIcon, Phone as PhoneIcon, MessageCircle, Mail } from "lucide-react";

interface Guest {
  name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
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

function ThemedDateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="group flex h-11 w-full items-center gap-2.5 rounded-lg border border-border/60 bg-background/80 px-3 text-left text-sm transition-all hover:border-gold/50 focus-within:border-gold/70 focus-within:ring-2 focus-within:ring-gold/20">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
          value
            ? "bg-gold/15 text-gold"
            : "bg-accent/40 text-foreground/70 group-hover:bg-gold/10 group-hover:text-gold"
        }`}
      >
        <CalendarIcon className="h-3.5 w-3.5" />
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

export function InvitationWizard() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState({
    templateId: 0,
    designId: "elegant-gold" as InvitationDesignId,
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

  function update<K extends keyof typeof data>(
    key: K,
    value: (typeof data)[K],
  ) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function addGuest() {
    if (!newGuest.name.trim()) return;
    const hasContact =
      (newGuest.email && newGuest.email.trim().length > 0) ||
      (newGuest.phone && newGuest.phone.trim().length > 0) ||
      (newGuest.whatsapp && newGuest.whatsapp.trim().length > 0);
    if (!hasContact) {
      alert(
        "Adaugă cel puțin un contact (email, telefon sau WhatsApp) pentru ca invitatul să poată confirma prezența.",
      );
      return;
    }
    setData((d) => ({ ...d, guests: [...d.guests, { ...newGuest }] }));
    setNewGuest({ name: "", email: "", phone: "", whatsapp: "" });
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
        return !!data.eventType && !!data.designId;
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
      // Map designId into customColors JSON so the public view can pick it up
      const body = {
        ...data,
        customColors: { designId: data.designId },
      };
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
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
              <Label className="mb-3 block">Design invitație</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {INVITATION_DESIGN_LIST.map((d) => {
                  const active = data.designId === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => update("designId", d.id)}
                      className={`overflow-hidden rounded-xl border-2 text-left transition-all ${
                        active
                          ? "border-gold shadow-lg"
                          : "border-border/40 hover:border-gold/30"
                      }`}
                    >
                      <div
                        className="p-6"
                        style={{
                          background: d.preview.bg,
                          color: d.preview.text,
                        }}
                      >
                        <div
                          className="text-center text-2xl"
                          style={{ color: d.preview.accent }}
                        >
                          {d.decorStyle === "sparkles" ? "✦" : d.decorStyle === "flowers" ? "❀" : d.decorStyle === "minimal" ? "—" : "❦"}
                        </div>
                        <div
                          className="text-center text-xs uppercase tracking-widest"
                          style={{ color: d.preview.accent }}
                        >
                          Ești invitat
                        </div>
                        <div
                          className="mt-1 text-center text-xl font-bold"
                          style={{
                            fontFamily: d.fontHeading ? `"${d.fontHeading}", serif` : undefined,
                          }}
                        >
                          Ana & Ion
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-card p-3">
                        <div>
                          <div className="text-sm font-medium">{d.name}</div>
                          <div className="text-xs text-muted-foreground">{d.description}</div>
                        </div>
                        {active && <Check className="h-5 w-5 shrink-0 text-gold" />}
                      </div>
                    </button>
                  );
                })}
              </div>
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
                <div className="mt-2">
                  <ThemedDateInput
                    value={data.eventDate}
                    onChange={(v) => update("eventDate", v)}
                  />
                </div>
              </div>
              <div>
                <Label>Termen limită RSVP</Label>
                <div className="mt-2">
                  <ThemedDateInput
                    value={data.rsvpDeadline}
                    onChange={(v) => update("rsvpDeadline", v)}
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Ora cununiei / ceremoniei</Label>
                <div className="mt-2">
                  <TimePicker
                    value={data.ceremonyTime}
                    onChange={(v) => update("ceremonyTime", v)}
                  />
                </div>
              </div>
              <div>
                <Label>Ora petrecerii</Label>
                <div className="mt-2">
                  <TimePicker
                    value={data.receptionTime}
                    onChange={(v) => update("receptionTime", v)}
                  />
                </div>
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
              <div className="grid gap-3">
                <Input
                  placeholder="Nume și prenume *"
                  value={newGuest.name}
                  onChange={(e) =>
                    setNewGuest({ ...newGuest, name: e.target.value })
                  }
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Email"
                      type="email"
                      value={newGuest.email || ""}
                      onChange={(e) =>
                        setNewGuest({ ...newGuest, email: e.target.value })
                      }
                      className="pl-9"
                    />
                  </div>
                  <div className="relative">
                    <PhoneIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Telefon"
                      value={newGuest.phone || ""}
                      onChange={(e) =>
                        setNewGuest({ ...newGuest, phone: e.target.value })
                      }
                      className="pl-9"
                    />
                  </div>
                  <div className="relative">
                    <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-green-500" />
                    <Input
                      placeholder="WhatsApp"
                      value={newGuest.whatsapp || ""}
                      onChange={(e) =>
                        setNewGuest({ ...newGuest, whatsapp: e.target.value })
                      }
                      className="pl-9"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cel puțin un contact (email, telefon sau WhatsApp) este obligatoriu pentru ca invitatul să poată confirma prezența.
                </p>
                <Button
                  type="button"
                  onClick={addGuest}
                  disabled={!newGuest.name.trim()}
                  className="w-full gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark sm:w-auto sm:ml-auto"
                >
                  <Plus className="h-4 w-4" /> Adaugă invitat
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
                      className="flex items-center justify-between gap-3 p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{g.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {g.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {g.email}
                            </span>
                          )}
                          {g.phone && (
                            <span className="flex items-center gap-1">
                              <PhoneIcon className="h-3 w-3" /> {g.phone}
                            </span>
                          )}
                          {g.whatsapp && (
                            <span className="flex items-center gap-1 text-green-500">
                              <MessageCircle className="h-3 w-3" /> {g.whatsapp}
                            </span>
                          )}
                        </div>
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
          className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
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
