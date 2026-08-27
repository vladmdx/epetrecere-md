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
  Copy,
  Check,
  Globe,
  Crown,
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
import { ReferralCard } from "@/components/shared/referral-card";
import { NotificationPrefsGrid } from "@/components/shared/notification-prefs-grid";
import { SignedDocumentsCard } from "@/components/vendor/signed-documents-card";
import { TimezoneSelector } from "@/components/shared/timezone-selector";
import { useLocale } from "@/hooks/use-locale";

interface VenueSettings {
  id: number;
  nameRo: string;
  calendarEnabled: boolean;
  autoReplyEnabled: boolean;
  autoReplyMessage: string | null;
  bufferHours: number | null;
}

type DigestFrequency = "instant" | "daily" | "weekly";

type Language = "ro" | "ru" | "en";

export function VenueSettingsClient({
  venue,
  userEmail,
  userPhone,
  userLanguage,
  userTimezone,
  icalUrl,
  notificationDigestFrequency,
}: {
  venue: VenueSettings;
  userEmail: string | null;
  userPhone: string | null;
  userLanguage: string;
  userTimezone: string;
  icalUrl: string;
  notificationDigestFrequency: string;
}) {
  const { t } = useLocale();
  const defaultAutoReply = t("vendor.venueSettings.defaultAutoReply");
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
        toast.error(t("vendor.venueSettings.toastLanguageError"));
        return;
      }
      toast.success(t("vendor.venueSettings.toastLanguageSaved"));
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
        toast.error(err.error || t("vendor.venueSettings.toastExportFailed"));
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
      toast.success(t("vendor.venueSettings.toastExportDone"));
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmText !== "ȘTERGE") {
      toast.error(t("vendor.venueSettings.toastTypeDelete"));
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/me/delete-account", { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("vendor.venueSettings.toastDeleteFailed"));
        return;
      }
      toast.success(t("vendor.venueSettings.toastAccountDeleted"));
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
        toast.error(err.error || t("vendor.venueSettings.toastSaveError"));
        return;
      }
      toast.success(t("vendor.venueSettings.toastFrequencySaved"));
    } finally {
      setSavingDigest(false);
    }
  }

  async function copyIcal() {
    try {
      await navigator.clipboard.writeText(icalUrl);
      setCopied(true);
      toast.success(t("referral.linkCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("vendor.venueSettings.toastCopyError"));
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
        toast.error(err.error || t("vendor.venueSettings.toastSaveError"));
        return;
      }
      toast.success(t("vendor.venueSettings.toastSettingsSaved"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("dashboard.settings")}</h1>
        <p className="text-muted-foreground">
          {t("vendor.venueSettings.configureVenue")} <strong>{venue.nameRo}</strong>
        </p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-gold" />
            {t("vendor.venueSettings.account")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("form.email")}</p>
              <p className="text-xs text-muted-foreground">{userEmail || "—"}</p>
            </div>
            <Link
              href="/user-profile"
              className="text-xs text-gold hover:underline"
            >
              {t("vendor.venueSettings.editInClerk")}
            </Link>
          </div>

          {/* Language selector — spec 11.1 */}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3">
            <div className="min-w-0 flex-1">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Globe className="h-3.5 w-3.5 text-gold" /> {t("vendor.venueSettings.interfaceLanguage")}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("vendor.venueSettings.languageHint")}
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

          <TimezoneSelector initialValue={userTimezone} />
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-gold" />
            {t("vendor.calendar")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
            <div className="min-w-0 flex-1">
              <Label className="cursor-pointer">
                {t("vendor.venueSettings.showCalendar")}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("vendor.venueSettings.showCalendarHint")}
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
              {t("vendor.venueSettings.bufferHours")}
              <span className="ml-2 text-xs text-muted-foreground">
                {t("vendor.venueSettings.bufferHoursHint")}
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
            {t("vendor.venueSettings.icalTitle")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("vendor.venueSettings.icalHint")}
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
             aria-label={t("vendor.venueSettings.copyAriaLabel")}>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <details className="rounded-lg bg-muted/20 p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              {t("vendor.venueSettings.icalHowTitle")}
            </summary>
            <ol className="mt-2 space-y-1 pl-4 text-muted-foreground">
              <li>{t("vendor.venueSettings.icalStep1")}</li>
              <li>{t("vendor.venueSettings.icalStep2")}</li>
              <li>{t("vendor.venueSettings.icalStep3")}</li>
            </ol>
          </details>
        </CardContent>
      </Card>

      {/* Auto-reply */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-gold" />
            {t("vendor.venueSettings.autoReplyTitle")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("vendor.venueSettings.autoReplyHint")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
            <div>
              <Label className="cursor-pointer">{t("vendor.venueSettings.enableAutoReply")}</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("vendor.venueSettings.enableAutoReplyHint")}
              </p>
            </div>
            <Switch
              checked={state.autoReplyEnabled}
              onCheckedChange={(v) =>
                setState({
                  ...state,
                  autoReplyEnabled: v,
                  autoReplyMessage:
                    v && !state.autoReplyMessage ? defaultAutoReply : state.autoReplyMessage,
                })
              }
            />
          </div>

          {state.autoReplyEnabled && (
            <div>
              <Label htmlFor="auto-reply-msg" className="text-xs">
                {t("vendor.venueSettings.autoReplyMessageLabel")}
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
                placeholder={defaultAutoReply}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("vendor.venueSettings.autoReplyCounter", { count: state.autoReplyMessage?.length ?? 0 })}
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
            {t("notifications.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("vendor.venueSettings.notifIntro")}
          </p>

          {/* Push (browser / PWA) */}
          <div className="rounded-lg bg-muted/30 p-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("vendor.venueSettings.pushTitle")}
            </Label>
            <p className="mt-1 mb-2 text-xs text-muted-foreground">
              {t("vendor.venueSettings.pushHint")}
            </p>
            <PushSubscribeButton />
          </div>

          {/* WhatsApp */}
          <div className="rounded-lg bg-green-500/5 border border-green-500/15 p-3">
            <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-green-500">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </Label>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              {t("vendor.venueSettings.whatsappHint")}
            </p>
            <WhatsAppPhoneInput initialValue={userPhone} />
          </div>

          {/* Per-type toggles — spec 11.2 */}
          <NotificationPrefsGrid />

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("vendor.venueSettings.digestTitle")}
            </Label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    value: "instant" as const,
                    title: t("vendor.venueSettings.digestInstant"),
                    desc: t("vendor.venueSettings.digestInstantDesc"),
                  },
                  {
                    value: "daily" as const,
                    title: t("vendor.venueSettings.digestDaily"),
                    desc: t("vendor.venueSettings.digestDailyDesc"),
                  },
                  {
                    value: "weekly" as const,
                    title: t("vendor.venueSettings.digestWeekly"),
                    desc: t("vendor.venueSettings.digestWeeklyDesc"),
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
              {t("vendor.venueSettings.digestNote")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* The Legal Pack this venue signed, with the record kept about it. */}
      <SignedDocumentsCard />

      {/* Appearance */}
      <AppearanceSettings />

      {/* Referral program */}
      <ReferralCard />

      {/* Plan & Billing — launch phase: all venues get Premium free */}
      <Card className="border-gold/40 bg-gradient-to-br from-gold/10 via-gold/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-gold" />
            {t("vendor.venueSettings.currentPlan")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-card/60 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/20">
              <Crown className="h-5 w-5 text-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-base font-bold text-gold">
                {t("vendor.venueSettings.premiumActive")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("vendor.venueSettings.premiumBlurb")}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("vendor.venueSettings.paidPlansNote")}
          </p>
        </CardContent>
      </Card>

      {/* GDPR — spec 11.6 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-gold" />
            {t("vendor.venueSettings.gdprTitle")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("vendor.venueSettings.gdprHint")}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("vendor.venueSettings.exportTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("vendor.venueSettings.exportHint")}
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
              {t("vendor.venueSettings.downloadJson")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-400">{t("vendor.venueSettings.deleteAccount")}</p>
              <p className="text-xs text-muted-foreground">
                {t("vendor.venueSettings.deleteAccountHint")}{" "}
                <strong className="text-red-400">{t("vendor.venueSettings.irreversible")}</strong>
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
              {t("vendor.venueSettings.deleteAccount")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400">
              {t("vendor.venueSettings.deleteDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("vendor.venueSettings.deleteWarnAccount")}{" "}
              <strong className="text-foreground">{userEmail}</strong>{t("vendor.venueSettings.deleteWarnVenue")}{" "}
              <strong className="text-foreground">{venue.nameRo}</strong>{" "}
              {t("vendor.venueSettings.deleteWarnRest")} <strong>{t("vendor.venueSettings.irreversibleWord")}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
              {t("vendor.venueSettings.backupHint")}{" "}
              <em>{t("vendor.venueSettings.downloadJson")}</em>).
            </div>
            <div>
              <Label htmlFor="delete-confirm" className="text-xs">
                {t("vendor.venueSettings.confirmTypeBefore")}{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                  ȘTERGE
                </code>{" "}
                {t("vendor.venueSettings.confirmTypeAfter")}
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
              {t("common.cancel")}
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
              {t("vendor.venueSettings.deletePermanently")}
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
          {t("vendor.venueSettings.saveSettings")}
        </Button>
      </div>
    </div>
  );
}

