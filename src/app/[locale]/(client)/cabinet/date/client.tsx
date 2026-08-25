"use client";

// M11 Intern #1 — GDPR self-service: export + delete account.

import { useState } from "react";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { Download, Trash2, Shield, FileText, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/hooks/use-locale";

export function DataPrivacyClient() {
  const { t } = useLocale();
  const { isSignedIn, isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  // The word the user has to type is shown to them, so it is translated —
  // the comparison reads the same key so the two can never drift apart.
  const confirmWord = t("cabinet.data.confirmWord");

  if (!isLoaded) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h1 className="mt-4 font-heading text-2xl font-bold">{t("cabinet.data.signInTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("cabinet.data.signInBody")}
        </p>
      </div>
    );
  }

  async function exportData() {
    setDownloading(true);
    try {
      const res = await fetch("/api/me/data-export");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `epetrecere-date-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(t("cabinet.data.exportError"));
    } finally {
      setDownloading(false);
    }
  }

  async function deleteAccount() {
    if (confirmText !== confirmWord) return;
    if (!confirm(t("cabinet.data.deleteConfirm"))) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/me/delete-account", { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      await signOut();
      window.location.href = "/";
    } catch {
      alert(t("cabinet.data.deleteError"));
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-[3px] text-gold">
          {t("cabinet.data.eyebrow")}
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          {t("cabinet.data.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          {t("cabinet.data.intro")}
        </p>
      </header>

      <div className="mt-8 space-y-4">
        {/* Profile info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("cabinet.data.accountTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">{t("cabinet.data.nameLabel")}</span>{" "}
              <strong>{user?.fullName || "—"}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">{t("cabinet.data.emailLabel")}</span>{" "}
              <strong>{user?.primaryEmailAddress?.emailAddress || "—"}</strong>
            </p>
          </CardContent>
        </Card>

        {/* Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4 text-gold" />
              {t("cabinet.data.exportTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("cabinet.data.exportBody")}
            </p>
            <Button
              onClick={exportData}
              disabled={downloading}
              className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {downloading
                ? t("cabinet.data.exportPending")
                : t("cabinet.data.exportCta")}
            </Button>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-gold" />
              {t("cabinet.data.legalTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link
              href="/confidentialitate"
              className="flex items-center justify-between rounded-lg border border-border/40 p-3 hover:border-gold/40"
            >
              <span>{t("cabinet.data.legalPrivacy")}</span>
              <span className="text-xs text-muted-foreground">{t("cabinet.data.legalRead")}</span>
            </Link>
            <Link
              href="/cookies"
              className="flex items-center justify-between rounded-lg border border-border/40 p-3 hover:border-gold/40"
            >
              <span>{t("cabinet.data.legalCookies")}</span>
              <span className="text-xs text-muted-foreground">{t("cabinet.data.legalRead")}</span>
            </Link>
            <Link
              href="/termeni"
              className="flex items-center justify-between rounded-lg border border-border/40 p-3 hover:border-gold/40"
            >
              <span>{t("cabinet.data.legalTerms")}</span>
              <span className="text-xs text-muted-foreground">{t("cabinet.data.legalRead")}</span>
            </Link>
          </CardContent>
        </Card>

        {/* Delete */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-4 w-4" />
              {t("cabinet.data.deleteTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                {t("cabinet.data.deleteWarningPrefix")}{" "}
                <strong>{t("cabinet.data.deleteWarningWord")}</strong>.{" "}
                {t("cabinet.data.deleteWarningBody")}
              </p>
            </div>
            <p className="mb-2 text-sm">
              {t("cabinet.data.confirmPrefix")}{" "}
              <code className="rounded bg-muted px-1">{confirmWord}</code>{" "}
              {t("cabinet.data.confirmSuffix")}
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmWord}
              className="mb-3 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-destructive focus:outline-none"
            />
            <Button
              variant="outline"
              onClick={deleteAccount}
              disabled={confirmText !== confirmWord || deleting}
              className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              {deleting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              {t("cabinet.data.deleteCta")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
