"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Save,
  Loader2,
  Bell,
  MessageCircle,
  CalendarDays,
  Mail,
  Shield,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Crown,
  Star,
  Sparkles,
  Download,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AppearanceSettings } from "@/components/shared/appearance-settings";
import { PushSubscribeButton } from "@/components/shared/push-subscribe-button";
import { WhatsAppPhoneInput } from "@/components/shared/whatsapp-phone-input";

interface VenueSettings {
  id: number;
  nameRo: string;
  calendarEnabled: boolean;
  autoReplyEnabled: boolean;
  autoReplyMessage: string | null;
  bufferHours: number | null;
}

const DEFAULT_AUTO_REPLY =
  "Mulțumim pentru interesul pentru sala noastră! Vă răspundem în 24h cu disponibilitatea exactă și oferta personalizată.";

type DigestFrequency = "instant" | "daily" | "weekly";

type Language = "ro" | "ru" | "en";

export function VenueSettingsClient({
  venue,
  userEmail,
  userPhone,
  userLanguage,
  icalUrl,
  notificationDigestFrequency,
}: {
  venue: VenueSettings;
  userEmail: string | null;
  userPhone: string | null;
  userLanguage: string;
  icalUrl: string;
  notificationDigestFrequency: string;
}) {
  const [state, setState] = useState<VenueSettings>(venue);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(
    (notificationDigestFrequency as DigestFrequency) || "instant",
  );
  const [savingDigest, setSavingDigest] = useState(false);
  const [language, setLanguage] = useState<Language>(
    (["ro", "ru", "en"].includes(userLanguage) ? userLanguage : "ro") as Language,
  );
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function saveLanguage(value: Language) {
    setSavingLanguage(true);
    const prev = language;
    setLanguage(value);
    try {
      const res = await fetch("/api/me/language", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: value }),
      });
      if (!res.ok) {
        setLanguage(prev);
        toast.error("Nu s-a putut salva limba");
        return;
      }
      toast.success("Limbă salvată");
    } finally {
      setSavingLanguage(false);
    }
  }

  async function downloadExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/me/data-export");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Export eșuat");
        return;
      }
      // Stream → Blob → download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `epetrecere-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Datele tale au fost descărcate");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmText !== "ȘTERGE") {
      toast.error("Tipărește ȘTERGE pentru confirmare");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/me/delete-account", { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Ștergere eșuată");
        return;
      }
      toast.success("Contul a fost șters. Te redirecționăm...");
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } finally {
      setDeleting(false);
    }
  }

  async function saveDigest(value: DigestFrequency) {
    setSavingDigest(true);
    const prev = digestFrequency;
    setDigestFrequency(value);
    try {
      const res = await fetch("/api/me/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestFrequency: value }),
      });
      if (!res.ok) {
        setDigestFrequency(prev);
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut salva");
        return;
      }
      toast.success("Frecvență salvată");
    } finally {
      setSavingDigest(false);
    }
  }

  async function copyIcal() {
    try {
      await navigator.clipboard.writeText(icalUrl);
      setCopied(true);
      toast.success("Link copiat!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Nu am putut copia");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/venues/${state.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarEnabled: state.calendarEnabled,
          autoReplyEnabled: state.autoReplyEnabled,
          autoReplyMessage: state.autoReplyMessage,
          bufferHours: state.bufferHours ?? 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut salva");
        return;
      }
      toast.success("Setări salvate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Setări</h1>
        <p className="text-muted-foreground">
          Configurează comportamentul sălii <strong>{venue.nameRo}</strong>
        </p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-gold" />
            Cont
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-xs text-muted-foreground">{userEmail || "—"}</p>
            </div>
            <Link
              href="/user-profile"
              className="text-xs text-gold hover:underline"
            >
              Modifică în Clerk →
            </Link>
          </div>

          {/* Language selector — spec 11.1 */}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3">
            <div className="min-w-0 flex-1">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Globe className="h-3.5 w-3.5 text-gold" /> Limba interfeței
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Afectează emailurile, dashboard-ul și notificările.
              </p>
            </div>
            <div className="flex gap-1 rounded-lg border border-border/40 p-0.5">
              {(["ro", "ru", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => saveLanguage(l)}
                  disabled={savingLanguage}
                  aria-pressed={language === l}
                  className={
                    language === l
                      ? "rounded-md bg-gold px-3 py-1 text-xs font-semibold text-[#0D0D0D]"
                      : "rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {l === "ro"
                    ? "🇷🇴 RO"
                    : l === "ru"
                      ? "🇷🇺 RU"
                      : "🇬🇧 EN"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Fus orar</p>
              <p className="text-xs text-muted-foreground">Europe/Chișinău</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              Fix
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-gold" />
            Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
            <div className="min-w-0 flex-1">
              <Label className="cursor-pointer">
                Afișează calendar pe profilul public
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Vizitatorii site-ului vor vedea ce zile sunt libere/ocupate pe
                profilul tău.
              </p>
            </div>
            <Switch
              checked={state.calendarEnabled}
              onCheckedChange={(v) =>
                setState({ ...state, calendarEnabled: v })
              }
            />
          </div>

          <div>
            <Label htmlFor="buffer-hours">
              Ore buffer între evenimente
              <span className="ml-2 text-xs text-muted-foreground">
                (pentru curățenie / reorganizare)
              </span>
            </Label>
            <Input
              id="buffer-hours"
              type="number"
              min="0"
              max="24"
              className="mt-1 max-w-[120px]"
              value={state.bufferHours ?? 0}
              onChange={(e) =>
                setState({
                  ...state,
                  bufferHours: e.target.value ? Number(e.target.value) : 0,
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* iCal feed / Google Calendar sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-gold" />
            Sincronizare Google / Apple Calendar
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Copiază link-ul de mai jos și adaugă-l ca „calendar abonat” în
            Google Calendar, Apple Calendar sau Outlook. Rezervările confirmate
            și zilele blocate vor apărea automat — update la fiecare câteva
            minute.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              readOnly
              value={icalUrl}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button
              onClick={copyIcal}
              size="icon"
              variant="outline"
              className="shrink-0"
             aria-label="Confirmă">
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <details className="rounded-lg bg-muted/20 p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Cum adaug link-ul în Google Calendar?
            </summary>
            <ol className="mt-2 space-y-1 pl-4 text-muted-foreground">
              <li>1. Deschide Google Calendar pe desktop</li>
              <li>2. În stânga: „Alte calendare” → „+” → „De la URL”</li>
              <li>3. Lipește link-ul și apasă „Adaugă calendarul”</li>
            </ol>
          </details>
        </CardContent>
      </Card>

      {/* Auto-reply */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-gold" />
            Răspuns automat
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Trimite un email instant clientului când lasă o solicitare de
            rezervare.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
            <div>
              <Label className="cursor-pointer">Activează auto-reply</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Clientul primește email imediat după trimiterea cererii.
              </p>
            </div>
            <Switch
              checked={state.autoReplyEnabled}
              onCheckedChange={(v) =>
                setState({
                  ...state,
                  autoReplyEnabled: v,
                  autoReplyMessage:
                    v && !state.autoReplyMessage ? DEFAULT_AUTO_REPLY : state.autoReplyMessage,
                })
              }
            />
          </div>

          {state.autoReplyEnabled && (
            <div>
              <Label htmlFor="auto-reply-msg" className="text-xs">
                Mesajul trimis (max 500 caractere)
              </Label>
              <Textarea
                id="auto-reply-msg"
                className="mt-1"
                value={state.autoReplyMessage ?? ""}
                onChange={(e) =>
                  setState({ ...state, autoReplyMessage: e.target.value })
                }
                maxLength={500}
                rows={4}
                placeholder={DEFAULT_AUTO_REPLY}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {(state.autoReplyMessage?.length ?? 0)} / 500 caractere.
                Mesajul este inserat într-un email cu branding ePetrecere.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-gold" />
            Notificări
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Notificările email sunt trimise automat la solicitări noi, mesaje,
            recenzii și plăți. Controlează mai jos cât de des le primești.
          </p>

          {/* Push (browser / PWA) */}
          <div className="rounded-lg bg-muted/30 p-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notificări instant pe dispozitiv
            </Label>
            <p className="mt-1 mb-2 text-xs text-muted-foreground">
              Primești un ping direct în browser / pe telefon (dacă ai instalat aplicația) când ai o solicitare nouă sau un mesaj.
            </p>
            <PushSubscribeButton />
          </div>

          {/* WhatsApp */}
          <div className="rounded-lg bg-green-500/5 border border-green-500/15 p-3">
            <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-green-500">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </Label>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              Pentru clienții din Moldova, WhatsApp e cel mai rapid canal.
              Setează-ți numărul aici pentru a primi notificări critice
              (booking-uri noi, confirmări) direct pe WhatsApp.
            </p>
            <WhatsAppPhoneInput initialValue={userPhone} />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Frecvență digest email
            </Label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    value: "instant" as const,
                    title: "Instant",
                    desc: "Un email pentru fiecare eveniment, imediat.",
                  },
                  {
                    value: "daily" as const,
                    title: "Zilnic",
                    desc: "Rezumat zilnic al tuturor evenimentelor.",
                  },
                  {
                    value: "weekly" as const,
                    title: "Săptămânal",
                    desc: "Rezumat săptămânal — mai puține emailuri.",
                  },
                ]
              ).map((opt) => {
                const active = digestFrequency === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => saveDigest(opt.value)}
                    disabled={savingDigest}
                    className={
                      active
                        ? "rounded-lg border-2 border-gold bg-gold/5 p-3 text-left transition-all"
                        : "rounded-lg border-2 border-border/40 p-3 text-left transition-all hover:border-gold/50"
                    }
                  >
                    <div className="flex items-center gap-2">
                      {active && (
                        <Check className="h-4 w-4 shrink-0 text-gold" />
                      )}
                      <p
                        className={
                          active
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground"
                        }
                      >
                        {opt.title}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              ℹ️ Notificările critice (ex: booking confirmat) sunt trimise
              mereu instant, indiferent de frecvență.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <AppearanceSettings />

      {/* Plan & Billing — spec 11.5 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-gold" />
            Plan & Facturare
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Planul tău curent:{" "}
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">
              Free
            </span>
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <PlanCard
              tier="free"
              name="Free"
              price="0€"
              period="pentru totdeauna"
              features={[
                "Până la 10 imagini galerie",
                "Profil public cu descriere",
                "Calendar disponibilitate",
                "Auto-reply email",
                "Notificări push + email",
                "AI Assistant (20 cereri/h)",
              ]}
              current
            />
            <PlanCard
              tier="pro"
              name="Pro"
              price="19€"
              period="/lună"
              badge="Popular"
              features={[
                "Până la 50 imagini galerie",
                "Analytics detaliat + comparație oraș",
                "Virtual tour 360°",
                "Meniu digital complet",
                "Priority support",
                "AI Assistant (100 cereri/h)",
              ]}
            />
            <PlanCard
              tier="premium"
              name="Premium"
              price="49€"
              period="/lună"
              features={[
                "Tot din Pro +",
                "Featured în listing top",
                "AI suggestions nelimitat",
                "Traducere automată RO/RU/EN",
                "Consulting personalizat 1:1",
                "Bonus: 0% comision primele 3 luni",
              ]}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">
              💳 Plățile Stripe vor fi disponibile în curând. Pentru upgrade
              contactează-ne la <strong>contact@epetrecere.md</strong>.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
            <div>
              <p className="text-sm font-medium">Istoric plăți</p>
              <p className="text-xs text-muted-foreground">
                Nicio tranzacție încă.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GDPR — spec 11.6 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-gold" />
            Date & Confidențialitate
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            În conformitate cu GDPR, ai dreptul la portabilitatea datelor
            (Art. 20) și ștergere (Art. 17).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Exportă datele mele</p>
              <p className="text-xs text-muted-foreground">
                Descarcă un fișier JSON cu profilul tău, toate rezervările,
                recenziile, mesajele și planurile de eveniment.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadExport}
              disabled={exporting}
              className="gap-1.5"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Descarcă JSON
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-400">Șterge contul</p>
              <p className="text-xs text-muted-foreground">
                Elimină contul, sala publicată și toate datele asociate.
                Leads păstrate de vendori sunt anonimizate.{" "}
                <strong className="text-red-400">Ireversibil.</strong>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteDialog(true);
                setDeleteConfirmText("");
              }}
              className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Șterge contul
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400">
              Ștergi contul definitiv?
            </DialogTitle>
            <DialogDescription>
              Vei pierde accesul la contul{" "}
              <strong className="text-foreground">{userEmail}</strong>, sala{" "}
              <strong className="text-foreground">{venue.nameRo}</strong> și
              toate datele asociate: recenzii, mesaje, planuri eveniment,
              galerie. Acțiunea este <strong>ireversibilă</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
              Recomandăm să descarci întâi o copie a datelor tale (butonul{" "}
              <em>Descarcă JSON</em>).
            </div>
            <div>
              <Label htmlFor="delete-confirm" className="text-xs">
                Pentru confirmare, tipărește{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                  ȘTERGE
                </code>{" "}
                mai jos:
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="ȘTERGE"
                className="mt-1 font-mono"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(false)}
              disabled={deleting}
            >
              Anulează
            </Button>
            <Button
              variant="outline"
              onClick={deleteAccount}
              disabled={deleting || deleteConfirmText !== "ȘTERGE"}
              className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              Șterge definitiv
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save */}
      <div className="sticky bottom-4 flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          className="gap-1.5 bg-gold text-[#0D0D0D] shadow-lg shadow-gold/20 hover:bg-gold-dark"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvează setările
        </Button>
      </div>
    </div>
  );
}

/** Single plan tile inside the Plan & Billing card. `current` styles the
 *  tile with a gold border + "Planul tău" badge. `badge` shows a small
 *  "Popular" chip on Pro. */
function PlanCard({
  tier,
  name,
  price,
  period,
  features,
  current,
  badge,
}: {
  tier: "free" | "pro" | "premium";
  name: string;
  price: string;
  period: string;
  features: string[];
  current?: boolean;
  badge?: string;
}) {
  const Icon = tier === "free" ? Sparkles : tier === "pro" ? Star : Crown;
  return (
    <div
      className={
        current
          ? "relative space-y-3 rounded-xl border-2 border-gold bg-gold/5 p-4"
          : "relative space-y-3 rounded-xl border border-border/40 bg-card p-4"
      }
    >
      {current && (
        <span className="absolute -top-2 left-3 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-[#0D0D0D]">
          Planul tău
        </span>
      )}
      {badge && !current && (
        <span className="absolute -top-2 right-3 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-[#0D0D0D]">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2">
        <Icon
          className={
            tier === "premium"
              ? "h-4 w-4 text-amber-400"
              : tier === "pro"
                ? "h-4 w-4 text-gold"
                : "h-4 w-4 text-muted-foreground"
          }
        />
        <span className="font-heading text-lg font-bold">{name}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-heading text-2xl font-bold">{price}</span>
        <span className="text-xs text-muted-foreground">{period}</span>
      </div>
      <ul className="space-y-1 text-xs">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-muted-foreground">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
