"use client";

// M11 Intern #1 — GDPR self-service: export + delete account.

import { useState } from "react";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { Download, Trash2, Shield, FileText, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DataPrivacyClient() {
  const { isSignedIn, isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

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
        <h1 className="mt-4 font-heading text-2xl font-bold">Autentifică-te</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pentru a-ți gestiona datele trebuie să fii conectat.
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
      alert("A apărut o eroare la export. Încearcă din nou.");
    } finally {
      setDownloading(false);
    }
  }

  async function deleteAccount() {
    if (confirmText !== "ȘTERGE") return;
    if (
      !confirm(
        "Ultima confirmare: ștergerea este definitivă. Toate datele tale vor fi eliminate. Continui?",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/me/delete-account", { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      await signOut();
      window.location.href = "/";
    } catch {
      alert("A apărut o eroare la ștergere. Contactează privacy@epetrecere.md");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-[3px] text-gold">
          GDPR & confidențialitate
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          Datele mele
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Conform GDPR și Legii 133/2011, ai dreptul să îți accesezi, exporti
          și ștergi datele personale de pe ePetrecere.md.
        </p>
      </header>

      <div className="mt-8 space-y-4">
        {/* Profile info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contul tău</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Nume:</span>{" "}
              <strong>{user?.fullName || "—"}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              <strong>{user?.primaryEmailAddress?.emailAddress || "—"}</strong>
            </p>
          </CardContent>
        </Card>

        {/* Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4 text-gold" />
              Exportă datele (portabilitate)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Descarcă un fișier JSON cu toate datele personale pe care le avem
              despre tine: profil, cereri, planuri, recenzii, mesaje, invitații
              și fotografii.
            </p>
            <Button
              onClick={exportData}
              disabled={downloading}
              className="gap-1 bg-gold text-background hover:bg-gold-dark"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {downloading ? "Pregătesc exportul…" : "Descarcă JSON"}
            </Button>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-gold" />
              Documente legale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link
              href="/confidentialitate"
              className="flex items-center justify-between rounded-lg border border-border/40 p-3 hover:border-gold/40"
            >
              <span>Politica de Confidențialitate</span>
              <span className="text-xs text-muted-foreground">citește →</span>
            </Link>
            <Link
              href="/cookies"
              className="flex items-center justify-between rounded-lg border border-border/40 p-3 hover:border-gold/40"
            >
              <span>Politica Cookies</span>
              <span className="text-xs text-muted-foreground">citește →</span>
            </Link>
            <Link
              href="/termeni"
              className="flex items-center justify-between rounded-lg border border-border/40 p-3 hover:border-gold/40"
            >
              <span>Termeni și Condiții</span>
              <span className="text-xs text-muted-foreground">citește →</span>
            </Link>
          </CardContent>
        </Card>

        {/* Delete */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-4 w-4" />
              Ștergerea contului
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Ștergerea este <strong>definitivă</strong>. Toate planurile,
                recenziile, invitațiile și fotografiile tale vor fi eliminate.
                Cererile pe care le-ai trimis furnizorilor vor fi anonimizate
                dar nu șterse din CRM-ul lor.
              </p>
            </div>
            <p className="mb-2 text-sm">
              Pentru a continua, scrie <code className="rounded bg-muted px-1">ȘTERGE</code>{" "}
              în câmpul de mai jos:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="ȘTERGE"
              className="mb-3 w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-destructive focus:outline-none"
            />
            <Button
              variant="outline"
              onClick={deleteAccount}
              disabled={confirmText !== "ȘTERGE" || deleting}
              className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              {deleting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Șterge contul definitiv
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
