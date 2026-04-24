"use client";

// Referral program card — shown inside Setări (both venue and artist
// dashboards). Displays the signed-in user's unique referral link, copy
// button, share buttons, accumulated credit, and a list of users they've
// referred with milestone badges.

import { useEffect, useState } from "react";
import {
  Users,
  Copy,
  Check,
  Loader2,
  Gift,
  Share2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Milestone {
  eventType: string;
  creditCents: number;
  createdAt: string;
}

interface ReferredUser {
  referredUserId: string;
  name: string | null;
  email: string | null;
  milestones: Milestone[];
  totalCredit: number;
}

interface ReferralData {
  code: string;
  shareUrl: string;
  creditCents: number;
  creditEur: number;
  referred: ReferredUser[];
}

const MILESTONE_LABELS: Record<string, { label: string; emoji: string }> = {
  signup: { label: "S-a înregistrat", emoji: "👋" },
  onboarded: { label: "Profil publicat", emoji: "✅" },
  first_booking: { label: "Prima rezervare", emoji: "🎉" },
};

export function ReferralCard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me/referral");
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function copyLink() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
      toast.success("Link copiat!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Nu s-a putut copia");
    }
  }

  async function webShare() {
    if (!data) return;
    const text = `Am folosit ePetrecere.md pentru evenimentul meu și chiar m-a ajutat. Încearcă-l și tu — folosește linkul meu: ${data.shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Invitație ePetrecere.md",
          text,
          url: data.shareUrl,
        });
      } catch {
        // User canceled — silent
      }
    } else {
      // Fallback: open mail client
      window.location.href = `mailto:?subject=${encodeURIComponent(
        "Invitație ePetrecere.md",
      )}&body=${encodeURIComponent(text)}`;
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4 text-gold" />
            Invită & câștigi
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className="border-gold/30 bg-gradient-to-br from-gold/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="h-4 w-4 text-gold" />
          Invită & câștigi credit
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Pentru fiecare prieten care își publică profilul primești{" "}
          <strong className="text-foreground">5€</strong>. Pentru prima lor
          rezervare acceptată pe platformă primești încă{" "}
          <strong className="text-foreground">20€</strong>. Creditul e
          redeemable împotriva abonamentului viitor (Stripe).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Credit display */}
        <div className="flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 p-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Credit acumulat
            </p>
            <p className="font-heading text-2xl font-bold text-gold">
              {data.creditEur.toFixed(2)}€
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {data.referred.length}{" "}
              {data.referred.length === 1 ? "persoană" : "persoane"} invitate
            </p>
          </div>
        </div>

        {/* Share link */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Linkul tău unic
          </label>
          <div className="mt-1 flex gap-2">
            <Input
              readOnly
              value={data.shareUrl}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              onClick={copyLink}
              variant="outline"
              size="icon"
              aria-label="Copiază link"
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              onClick={webShare}
              className="shrink-0 gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              <Share2 className="h-4 w-4" /> Share
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Codul tău: <code className="font-mono">{data.code}</code>
          </p>
        </div>

        {/* Referred users list */}
        {data.referred.length > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Persoane invitate ({data.referred.length})
            </label>
            <ul className="mt-2 space-y-2">
              {data.referred.map((u) => (
                <li
                  key={u.referredUserId}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-background/40 p-2 text-sm"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {u.name || u.email || "Utilizator"}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {u.milestones.map((m) => {
                        const cfg = MILESTONE_LABELS[m.eventType] ?? {
                          label: m.eventType,
                          emoji: "•",
                        };
                        return (
                          <span
                            key={m.eventType}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
                            title={new Date(m.createdAt).toLocaleString("ro-RO")}
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {cfg.emoji} {cfg.label}
                          </span>
                        );
                      })}
                      {!u.milestones.find(
                        (m) => m.eventType === "first_booking",
                      ) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          Așteaptă prima rezervare
                        </span>
                      )}
                    </div>
                  </div>
                  {u.totalCredit > 0 && (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold">
                      +{(u.totalCredit / 100).toFixed(0)}€
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.referred.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
            Încă n-ai invitat pe nimeni. Distribuie linkul prietenilor care au
            nevoie de servicii pentru evenimente!
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          ℹ️ Creditul se acumulează automat când persoana invitată își
          publică profilul sau primește o rezervare. Plățile Stripe urmează.
        </p>
      </CardContent>
    </Card>
  );
}
