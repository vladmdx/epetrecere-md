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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AppearanceSettings } from "@/components/shared/appearance-settings";

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

export function VenueSettingsClient({
  venue,
  userEmail,
  icalUrl,
}: {
  venue: VenueSettings;
  userEmail: string | null;
  icalUrl: string;
}) {
  const [state, setState] = useState<VenueSettings>(venue);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

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
        <CardContent className="space-y-3">
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
            >
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
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Notificările email sunt trimise automat la solicitări noi, mesaje,
            recenzii și plăți. Le poți vedea în panoul principal ca activitate
            recentă.
          </p>
        </CardContent>
      </Card>

      {/* Appearance */}
      <AppearanceSettings />

      {/* GDPR */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-gold" />
            Date & Confidențialitate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 p-3">
            <div>
              <p className="text-sm font-medium">Exportă datele mele</p>
              <p className="text-xs text-muted-foreground">
                Descarcă un fișier JSON cu toate datele sălii tale.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.info("Funcționalitate disponibilă în curând")
              }
              className="gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Exportă
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <div>
              <p className="text-sm font-medium text-red-400">Șterge contul</p>
              <p className="text-xs text-muted-foreground">
                Elimină sala și toate datele asociate (ireversibil).
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.info(
                  "Pentru a-ți șterge contul, contactează-ne pe contact@epetrecere.md",
                )
              }
              className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              Solicită ștergere
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="sticky bottom-4 flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          className="gap-1.5 bg-gold text-background shadow-lg shadow-gold/20 hover:bg-gold-dark"
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
