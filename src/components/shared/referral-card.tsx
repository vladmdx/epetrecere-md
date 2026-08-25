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
import { useLocale } from "@/hooks/use-locale";

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

const MILESTONE_LABELS: Record<string, { labelKey: string; emoji: string }> = {
  signup: { labelKey: "referral.milestone.signup", emoji: "👋" },
  onboarded: { labelKey: "referral.milestone.onboarded", emoji: "✅" },
  first_booking: { labelKey: "referral.milestone.firstBooking", emoji: "🎉" },
};

export function ReferralCard() {
  const { t } = useLocale();
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
      toast.success(t("referral.linkCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("referral.copyFailed"));
    }
  }

  async function webShare() {
    if (!data) return;
    const text = t("referral.shareText", { url: data.shareUrl });
    const title = t("referral.shareTitle");
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url: data.shareUrl,
        });
      } catch {
        // User canceled — silent
      }
    } else {
      // Fallback: open mail client
      window.location.href = `mailto:?subject=${encodeURIComponent(
        title,
      )}&body=${encodeURIComponent(text)}`;
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4 text-gold" />
            {t("referral.titleShort")}
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
          {t("referral.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("referral.intro.p1")}{" "}
          <strong className="text-foreground">5€</strong>
          {t("referral.intro.p2")}{" "}
          <strong className="text-foreground">20€</strong>
          {t("referral.intro.p3")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Credit display */}
        <div className="flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 p-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("referral.creditEarned")}
            </p>
            <p className="font-heading text-2xl font-bold text-gold">
              {data.creditEur.toFixed(2)}€
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {data.referred.length === 1
                ? t("referral.invitedOne", { count: data.referred.length })
                : t("referral.invitedMany", { count: data.referred.length })}
            </p>
          </div>
        </div>

        {/* Share link */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("referral.uniqueLink")}
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
              aria-label={t("referral.copyLink")}
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
              <Share2 className="h-4 w-4" /> {t("referral.share")}
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t("referral.yourCode")} <code className="font-mono">{data.code}</code>
          </p>
        </div>

        {/* Referred users list */}
        {data.referred.length > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("referral.invitedPeople")} ({data.referred.length})
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
                      {u.name || u.email || t("referral.userFallback")}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {u.milestones.map((m) => {
                        const cfg = MILESTONE_LABELS[m.eventType];
                        const label = cfg ? t(cfg.labelKey) : m.eventType;
                        const emoji = cfg?.emoji ?? "•";
                        return (
                          <span
                            key={m.eventType}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
                            title={new Date(m.createdAt).toLocaleString("ro-RO")}
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {emoji} {label}
                          </span>
                        );
                      })}
                      {!u.milestones.find(
                        (m) => m.eventType === "first_booking",
                      ) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {t("referral.awaitingFirstBooking")}
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
            {t("referral.emptyState")}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          {t("referral.footnote")}
        </p>
      </CardContent>
    </Card>
  );
}
